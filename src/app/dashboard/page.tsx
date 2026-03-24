import Link from "next/link";
import { Buffer } from "node:buffer";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient, createServerSupabaseClient } from "../../lib/supabase/server";
import { DEFAULT_LAYOUT_ID, LAYOUTS } from "../../lib/layouts";
import { getDefaultSections } from "../../lib/default-sections";
import { Database } from "../../lib/database.types";
import { generatePublicAccessToken } from "../../lib/homebook-access";
import { validateUploadCandidate } from "../../lib/upload-limits";
import { createSignedUrlMapForValues, resolveStorageValueWithSignedMap } from "../../lib/storage-media";
import { DeleteHomebookButton } from "../../components/delete-homebook-button";
import { PublicLinkActions } from "../../components/public-link-actions";
import { DeletePropertyButton } from "../../components/delete-property-button";
import { PropertyImagePicker } from "../../components/property-image-picker";
import { DashboardLayoutShowcase } from "../../components/dashboard-layout-showcase";
import { LegalLinks } from "../../components/legal-links";
import { FormSubmitButton } from "../../components/form-submit-button";
import { LEGAL_ACCEPTANCE_SOURCE_RENEWAL, LEGAL_LAST_UPDATED_LABEL } from "../../lib/legal";
import { acceptCurrentLegalDocuments, getLegalAcceptanceState, requireCurrentLegalAcceptance } from "../../lib/legal-acceptance";
import { getSiteUrl } from "../../lib/site-url";
import { TRIAL_DURATION_DAYS, ensureUserBillingState, type UserBillingState } from "../../lib/subscription";
import { syncStripeSubscriptionForUserSafely } from "../../lib/stripe-subscription-sync";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DashboardSearchParams = {
  billing?: string | string[];
  legal?: string | string[];
};

const CLASSICO_DEFAULT_SUBSECTIONS = ["Prima di partire", "Orario", "Formalità", "Self check-in", "Check-in in presenza"];
const CLASSICO_LIKE_LAYOUTS = new Set([
  "classico",
  "mediterraneo",
  "moderno",
  "illustrativo",
  "pastello",
  "futuristico",
  "notturno"
]);
const SUPABASE_TIMEOUT_MS = 10000;
const SITE_URL = getSiteUrl();

const CLASSICO_EXTRA_SECTIONS: Record<string, string[]> = {
  "check-in": CLASSICO_DEFAULT_SUBSECTIONS,
  "come raggiungerci": ["Auto", "Aereo", "Bus", "Traghetto", "Metro", "Treno", "Noleggio"],
  "la nostra struttura": [
    "La casa",
    "Cucina",
    "Terrazza",
    "Giardino",
    "Piscina",
    "Camera da letto",
    "Soggiorno",
    "Bagno"
  ],
  funzionamento: [
    "Accesso struttura",
    "Parcheggio",
    "Biancheria",
    "Rifiuti",
    "Wi-Fi",
    "Climatizzatore",
    "Riscaldamento"
  ],
  "regole struttura": [
    "Check-in",
    "Check-out",
    "Vietato fumare",
    "Silenzio e buon vicinato",
    "Accesso altri ospiti",
    "Animali",
    "Documenti",
    "Chiavi della casa",
    "Inventario",
    "Pulizie"
  ],
  "numeri utili": [
    "Accoglienza",
    "Guardia medica",
    "Farmacia",
    "Ambulanza",
    "Polizia",
    "Vigili del fuoco",
    "Taxi"
  ],
  "check-out": [
    "Orario",
    "Pulizie",
    "Inventario",
    "Chiavi"
  ]
};

const normalizeTitle = (title: string) =>
  title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

async function insertDefaultSubsectionsForClassicLayouts(
  supabase: any,
  layout_type: string,
  sections:
    | {
        id: string;
        title: string;
      }[]
    | null
) {
  // I layout classico/moderno/illustrativo/pastello riusano la stessa impalcatura di sottosezioni.
  if (!CLASSICO_LIKE_LAYOUTS.has(layout_type) || !sections) return;
  const toInsert: Database["public"]["Tables"]["subsections"]["Insert"][] = [];
  for (const [sectionTitle, subs] of Object.entries(CLASSICO_EXTRA_SECTIONS)) {
    const match = sections.find((s) => normalizeTitle(s.title) === normalizeTitle(sectionTitle));
    if (!match) continue;
    const subsQuery = supabase.from("subsections").select("id", { head: true, count: "exact" });
    const { count } = await (subsQuery as any).eq("section_id", match.id);
    if ((count ?? 0) > 0) continue;
    subs.forEach((label) => {
      toInsert.push({
        section_id: match.id,
        content_text: label
      });
    });
  }
  if (toInsert.length) {
    await (supabase.from("subsections") as any).insert(toInsert);
  }
}

async function requireDashboardSession() {
  const supabase = createServerSupabaseClient() as any;
  const admin = createAdminClient() as any;
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  return { supabase, admin, user };
}

async function requireDashboardServiceAccess() {
  const { supabase, admin, user } = await requireDashboardSession();

  try {
    await requireCurrentLegalAcceptance(admin, user.id);
  } catch (error: any) {
    if (error?.message === "legal_acceptance_required") {
      redirect("/dashboard?legal=required");
    }
    throw error;
  }

  const billing = await ensureUserBillingState(admin, {
    userId: user.id,
    email: user.email ?? null,
    syncPlan: true
  });
  if (!billing.serviceActive) redirect("/dashboard?billing=inactive");

  return { supabase, admin, user, billing };
}

async function acceptUpdatedLegalDocumentsAction() {
  "use server";

  const { admin, user } = await requireDashboardSession();
  await acceptCurrentLegalDocuments(admin, {
    userId: user.id,
    email: user.email ?? null,
    source: LEGAL_ACCEPTANCE_SOURCE_RENEWAL
  });
  revalidatePath("/dashboard");
  redirect("/dashboard?legal=updated");
}

async function createPropertyAction(formData: FormData) {
  "use server";
  const { supabase, admin, user } = await requireDashboardServiceAccess();

  const name = formData.get("name")?.toString() ?? "";
  const address = formData.get("address")?.toString() ?? "";
  const main_image_url = formData.get("main_image_url")?.toString() ?? null;
  const short_description = formData.get("short_description")?.toString() ?? null;

  if (!name) return;

  const propertyPayload: Database["public"]["Tables"]["properties"]["Insert"] = {
    user_id: user.id,
    name,
    address,
    main_image_url,
    short_description
  };

  await (supabase.from("properties") as any).insert(propertyPayload);
  const billingAfterCreate = await ensureUserBillingState(admin, {
    userId: user.id,
    email: user.email ?? null,
    syncPlan: true
  });
  await syncStripeSubscriptionForUserSafely(admin, {
    userId: user.id,
    email: user.email ?? null,
    propertyCount: billingAfterCreate.propertyCount,
    context: "dashboard_create_property"
  });

  revalidatePath("/dashboard");
}

async function updatePropertyAction(formData: FormData) {
  "use server";
  const { supabase, user } = await requireDashboardServiceAccess();

  const property_id = formData.get("property_id")?.toString() ?? "";
  const name = formData.get("name")?.toString() ?? "";
  const address = formData.get("address")?.toString() ?? "";
  const main_image_url = formData.get("main_image_url")?.toString() ?? "";
  const main_image_file = formData.get("main_image_file");
  const short_description = formData.get("short_description")?.toString() ?? "";

  if (!property_id || !name) return;

  const { data: property } = await (supabase.from("properties") as any)
    .select("id, user_id")
    .eq("id", property_id)
    .single();
  if (!property || property.user_id !== user.id) return;

  const uploadedUrl =
    main_image_file instanceof File && main_image_file.size > 0
      ? await uploadImageToStorage(main_image_file as File, `properties/${property_id}`)
      : null;

  await (supabase.from("properties") as any)
    .update({
      name,
      address: address || null,
      main_image_url: uploadedUrl || main_image_url || null,
      short_description: short_description || null
    })
    .eq("id", property_id);

  revalidatePath("/dashboard");
}

const STORAGE_BUCKET = "homebook-media";

async function uploadImageToStorage(file: File | null, pathPrefix: string) {
  if (!file || typeof file.arrayBuffer !== "function" || file.size == 0) return null;
  const validation = validateUploadCandidate(
    {
      name: file.name,
      size: file.size,
      type: file.type
    },
    "cover"
  );
  if (!validation.ok) return null;

  const admin = createAdminClient();
  const arrayBuffer = await file.arrayBuffer();
  const filePath = `${pathPrefix}/${Date.now()}-${file.name}`.replace(/\s+/g, "-");
  const { data, error } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, Buffer.from(arrayBuffer), {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "image/jpeg"
    });
  if (error || !data?.path) return null;
  return data.path;
}

async function deletePropertyAction(formData: FormData) {
  "use server";
  const { supabase, admin, user } = await requireDashboardServiceAccess();

  const property_id = formData.get("property_id")?.toString() ?? "";
  if (!property_id) return;

  const { data: property } = await (supabase.from("properties") as any)
    .select("id, user_id")
    .eq("id", property_id)
    .single();
  if (!property || property.user_id !== user.id) return;

  const { data: homebooks } = await (supabase.from("homebooks") as any)
    .select("id")
    .eq("property_id", property_id);
  const homebookIds = (homebooks ?? []).map((h: { id: string }) => h.id);

  if (homebookIds.length) {
    const { data: sections } = await (supabase.from("sections") as any).select("id").in("homebook_id", homebookIds);
    const sectionIds = (sections ?? []).map((s: { id: string }) => s.id);

    if (sectionIds.length) {
      const { data: subsections } = await (supabase.from("subsections") as any)
        .select("id")
        .in("section_id", sectionIds);
      const subsectionIds = (subsections ?? []).map((s: { id: string }) => s.id);

      if (subsectionIds.length) {
        await (supabase.from("media") as any).delete().in("subsection_id", subsectionIds);
      }
      await (supabase.from("media") as any).delete().in("section_id", sectionIds);
      await (supabase.from("subsections") as any).delete().in("section_id", sectionIds);
    }
    await (supabase.from("sections") as any).delete().in("homebook_id", homebookIds);
    await (supabase.from("homebooks") as any).delete().in("property_id", property_id);
  }

  await (supabase.from("properties") as any).delete().eq("id", property_id);
  const billingAfterDelete = await ensureUserBillingState(admin, {
    userId: user.id,
    email: user.email ?? null,
    syncPlan: true
  });
  await syncStripeSubscriptionForUserSafely(admin, {
    userId: user.id,
    email: user.email ?? null,
    propertyCount: billingAfterDelete.propertyCount,
    context: "dashboard_delete_property"
  });

  revalidatePath("/dashboard");
}

async function createHomebookAction(formData: FormData) {
  "use server";
  const { supabase, user } = await requireDashboardServiceAccess();

  const property_id = formData.get("property_id")?.toString() ?? "";
  const title = formData.get("title")?.toString() ?? "";
  const layout_type = formData.get("layout_type")?.toString() || DEFAULT_LAYOUT_ID;

  if (!property_id || !title) return;

  const { data: ownedProperty } = await (supabase.from("properties") as any)
    .select("id, user_id")
    .eq("id", property_id)
    .single();
  if (!ownedProperty || ownedProperty.user_id !== user.id) return;

  const public_slug = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  const public_access_token = generatePublicAccessToken();

  const homebookPayload: Database["public"]["Tables"]["homebooks"]["Insert"] = {
    property_id,
    title,
    layout_type,
    public_slug,
    public_access_token,
    public_access_enabled: true,
    is_published: false
  };

  const { data: homebook } = await (supabase.from("homebooks") as any)
    .insert(homebookPayload)
    .select("id")
    .single();

  if (homebook?.id) {
    const defaultSections: Database["public"]["Tables"]["sections"]["Insert"][] = getDefaultSections(layout_type).map((section) => ({
      ...section,
      homebook_id: homebook.id
    }));
    if (defaultSections.length) {
      const { data: insertedSections } = await (supabase.from("sections") as any)
        .insert(defaultSections)
        .select("id, title");
      await insertDefaultSubsectionsForClassicLayouts(supabase, layout_type, insertedSections);
    }
  }

  revalidatePath("/dashboard");
}

async function deleteHomebookAction(formData: FormData) {
  "use server";
  const { supabase, user } = await requireDashboardServiceAccess();

  const homebook_id = formData.get("homebook_id")?.toString() ?? "";
  if (!homebook_id) return;

  const { data: homebook } = await (supabase.from("homebooks") as any)
    .select("id, property_id, properties(user_id)")
    .eq("id", homebook_id)
    .single();

  if (!homebook || (homebook as any).properties?.user_id !== user.id) {
    return;
  }

  const { data: sections } = await (supabase.from("sections") as any).select("id").eq("homebook_id", homebook_id);
  const sectionIds = (sections ?? []).map((s: { id: string }) => s.id);

  if (sectionIds.length) {
    const { data: subsections } = await (supabase.from("subsections") as any)
      .select("id")
      .in("section_id", sectionIds);
    const subsectionIds = (subsections ?? []).map((s: { id: string }) => s.id);

    if (subsectionIds.length) {
      await (supabase.from("media") as any).delete().in("subsection_id", subsectionIds);
    }
    await (supabase.from("media") as any).delete().in("section_id", sectionIds);
    await (supabase.from("subsections") as any).delete().in("section_id", sectionIds);
  }

  await (supabase.from("sections") as any).delete().eq("homebook_id", homebook_id);
  await (supabase.from("homebooks") as any).delete().eq("id", homebook_id);

  revalidatePath("/dashboard");
}

async function rotatePublicAccessTokenAction(formData: FormData) {
  "use server";
  const { supabase, user } = await requireDashboardServiceAccess();

  const homebook_id = formData.get("homebook_id")?.toString() ?? "";
  if (!homebook_id) return;

  const { data: homebook } = await (supabase.from("homebooks") as any)
    .select("id, properties(user_id)")
    .eq("id", homebook_id)
    .single();

  if (!homebook || (homebook as any).properties?.user_id !== user.id) return;

  await (supabase.from("homebooks") as any)
    .update({ public_access_token: generatePublicAccessToken() })
    .eq("id", homebook_id);

  revalidatePath("/dashboard");
}

async function setPublicAccessEnabledAction(formData: FormData) {
  "use server";
  const { supabase, user } = await requireDashboardServiceAccess();

  const homebook_id = formData.get("homebook_id")?.toString() ?? "";
  const enabled = formData.get("public_access_enabled")?.toString() === "true";
  if (!homebook_id) return;

  const { data: homebook } = await (supabase.from("homebooks") as any)
    .select("id, properties(user_id)")
    .eq("id", homebook_id)
    .single();

  if (!homebook || (homebook as any).properties?.user_id !== user.id) return;

  await (supabase.from("homebooks") as any)
    .update({ public_access_enabled: enabled })
    .eq("id", homebook_id);

  revalidatePath("/dashboard");
}

async function withTimeout<T = any>(promise: PromiseLike<T>, label: string, ms = SUPABASE_TIMEOUT_MS): Promise<T> {
  return await Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) => {
      const id = setTimeout(() => {
        clearTimeout(id);
        reject(new Error(`${label} timeout`));
      }, ms);
    })
  ]);
}

function isNextRedirectError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

function readQueryValue(searchParams: DashboardSearchParams | undefined, key: keyof DashboardSearchParams) {
  const raw = searchParams?.[key];
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw[0] ?? "";
  return "";
}

function getBillingBanner(code: string) {
  switch (code) {
    case "inactive":
      return {
        tone: "warning" as const,
        message: "Abbonamento non attivo. Attiva un piano per sbloccare tutte le funzionalita."
      };
    case "checkout_success":
      return {
        tone: "success" as const,
        message: "Pagamento completato. Lo stato abbonamento si aggiornara automaticamente tra pochi secondi."
      };
    case "checkout_cancel":
      return {
        tone: "warning" as const,
        message: "Checkout annullato. Nessun addebito effettuato."
      };
    case "checkout_not_configured":
      return {
        tone: "danger" as const,
        message: "Checkout non configurato: mancano i price id Stripe nel progetto."
      };
    case "checkout_error":
      return {
        tone: "danger" as const,
        message: "Errore durante la creazione del checkout. Riprova tra poco."
      };
    case "portal_not_configured":
      return {
        tone: "danger" as const,
        message: "Portale fatturazione non configurato: verifica la chiave Stripe in produzione."
      };
    case "portal_unavailable":
      return {
        tone: "warning" as const,
        message: "Portale non disponibile per questo account: attiva prima un abbonamento."
      };
    case "portal_error":
      return {
        tone: "danger" as const,
        message: "Errore nell'apertura del portale Stripe. Riprova tra poco."
      };
    case "portal_return":
      return {
        tone: "success" as const,
        message: "Rientro dal portale abbonamento completato."
      };
    case "gift_active":
      return {
        tone: "warning" as const,
        message: "Questo account ha un omaggio attivo: checkout disabilitato finche resta l'override gratuito."
      };
    default:
      return null;
  }
}

function getLegalBanner(code: string) {
  switch (code) {
    case "required":
      return {
        tone: "warning" as const,
        message: "Prima di continuare devi accettare la versione aggiornata di Termini e Privacy."
      };
    case "updated":
      return {
        tone: "success" as const,
        message: "Documenti legali aggiornati accettati correttamente."
      };
    default:
      return null;
  }
}

function getBannerStyles(tone: "success" | "warning" | "danger") {
  return {
    border:
      tone === "success" ? "1px solid #b7ebc6" : tone === "warning" ? "1px solid #f5d48a" : "1px solid #f3b0b0",
    background: tone === "success" ? "#f0fff4" : tone === "warning" ? "#fff8e8" : "#fff1f1",
    color: tone === "success" ? "#14532d" : tone === "warning" ? "#7a4b00" : "#8b1b1b"
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "short" }).format(date);
}

function getTrialBanner(billingState: UserBillingState, now = new Date()) {
  if (billingState.billingOverride === "friend_free") return null;
  if (billingState.status !== "trial") return null;
  if (!billingState.trialEndsAt) {
    return {
      tone: "warning" as const,
      message: `Periodo di prova di ${TRIAL_DURATION_DAYS} giorni attivo. Alla scadenza perderai accesso a creazione, modifica, pubblicazione e link ospiti finche non attivi un abbonamento.`
    };
  }
  const endDate = new Date(billingState.trialEndsAt);
  if (Number.isNaN(endDate.getTime())) {
    return {
      tone: "warning" as const,
      message: `Periodo di prova di ${TRIAL_DURATION_DAYS} giorni attivo. Alla scadenza perderai accesso a creazione, modifica, pubblicazione e link ospiti finche non attivi un abbonamento.`
    };
  }
  const daysLeft = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / DAY_MS));
  const when =
    daysLeft === 0
      ? "scade oggi"
      : daysLeft === 1
        ? "scade domani"
        : `scade il ${formatShortDate(endDate)} (tra ${daysLeft} giorni)`;

  return {
    tone: "warning" as const,
    message: `Periodo di prova di ${TRIAL_DURATION_DAYS} giorni attivo: ${when}. Alla scadenza perderai accesso a creazione, modifica, pubblicazione e link ospiti finche non attivi un abbonamento.`
  };
}

export default async function DashboardPage({
  searchParams
}: {
  searchParams?: Promise<DashboardSearchParams>;
}) {
  try {
    const resolvedSearchParams = searchParams ? await searchParams : undefined;
    const { supabase, admin, user } = await requireDashboardSession();
    const billingState = await ensureUserBillingState(admin, {
      userId: user.id,
      email: user.email ?? null,
      syncPlan: true
    });
    const legalState = await getLegalAcceptanceState(admin, user.id);
    const billingMessage = getBillingBanner(readQueryValue(resolvedSearchParams, "billing"));
    const legalBannerCode = readQueryValue(resolvedSearchParams, "legal");
    const legalMessage =
      legalBannerCode === "required" && !legalState.requiresAcceptance ? null : getLegalBanner(legalBannerCode);
    const trialMessage = getTrialBanner(billingState);

    const { data: billingUserRow } = await withTimeout(
      (admin.from("users") as any)
        .select("stripe_customer_id, stripe_subscription_id, billing_override, subscription_status, plan_type")
        .eq("id", user.id)
        .maybeSingle(),
      "Profilo billing"
    );
    const hasStripeCustomer = Boolean((billingUserRow?.stripe_customer_id ?? "").trim());
    const hasActiveGiftOverride = (billingUserRow?.billing_override ?? "").toLowerCase() === "friend_free";

    const { data: properties } = await withTimeout(
      (supabase.from("properties") as any)
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", {
          ascending: false
        }),
      "Proprietà"
    );
    const ownedPropertyIds = (properties ?? []).map((property: Database["public"]["Tables"]["properties"]["Row"]) => property.id);

    let homebooks: any[] = [];
    if (ownedPropertyIds.length) {
      const { data } = await withTimeout(
        (supabase.from("homebooks") as any)
          .select("*, properties(name)")
          .in("property_id", ownedPropertyIds)
          .order("created_at", { ascending: false }),
        "Homebook"
      );
      homebooks = data ?? [];
    }
    let propertySignedMap = new Map<string, string>();
    if ((properties ?? []).length) {
      try {
        const storageAdmin = createAdminClient() as any;
        propertySignedMap = await createSignedUrlMapForValues(
          storageAdmin,
          (properties ?? []).map((property: Database["public"]["Tables"]["properties"]["Row"]) => property.main_image_url)
        );
      } catch {
        propertySignedMap = new Map<string, string>();
      }
    }
    const propertyImageById = new Map<string, string | null>();
    (properties ?? []).forEach((property: Database["public"]["Tables"]["properties"]["Row"]) => {
      propertyImageById.set(
        property.id,
        resolveStorageValueWithSignedMap(property.main_image_url, propertySignedMap) ?? null
      );
    });

    if (legalState.requiresAcceptance) {
      const legalReasonMessage =
        legalState.reason === "outdated"
          ? `Abbiamo aggiornato i documenti legali il ${LEGAL_LAST_UPDATED_LABEL}. Per continuare a usare dashboard, editor, pubblicazione e checkout devi confermare la nuova versione.`
          : "Prima di continuare devi registrare l'accettazione corrente di Termini e Privacy per questo account.";

      return (
        <div className="grid dashboard-page" style={{ gap: 24 }}>
          {legalMessage ? (
            <div className="card" style={getBannerStyles(legalMessage.tone)}>
              {legalMessage.message}
            </div>
          ) : null}
          {billingMessage ? (
            <div className="card" style={getBannerStyles(billingMessage.tone)}>
              {billingMessage.message}
            </div>
          ) : null}
          {trialMessage ? (
            <div className="card" style={getBannerStyles(trialMessage.tone)}>
              {trialMessage.message}
            </div>
          ) : null}
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div className="pill">Bentornato</div>
              <h2 style={{ margin: "8px 0 0", color: "#0e4b58" }}>{user.email}</h2>
              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                <div className="pill">Piano: {billingState.planType}</div>
                <div className="pill">
                  Stato: {billingState.billingOverride === "friend_free" ? "omaggio attivo" : billingState.serviceActive ? billingState.status : "non attivo"}
                </div>
                {billingState.billingOverride === "friend_free" ? <div className="pill">Override: gratuito</div> : null}
              </div>
              <p style={{ margin: "8px 0 0", color: "#7a4b00", fontSize: 13 }}>
                Accesso operativo sospeso finche non completi la riaccettazione dei documenti.
              </p>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {hasStripeCustomer ? (
                <form action="/api/stripe/portal" method="post">
                  <button className="btn btn-secondary" type="submit">
                    Gestisci abbonamento
                  </button>
                </form>
              ) : null}
              <form action="/api/auth/logout" method="post">
                <button className="btn btn-secondary" type="submit">
                  Logout
                </button>
              </form>
            </div>
          </header>

          <section
            className="card"
            style={{ display: "grid", gap: 16, border: "1px solid #f5d48a", background: "#fffdf6" }}
          >
            <div className="pill" style={{ width: "fit-content", background: "#fff4cf", color: "#7a4b00" }}>
              Azione richiesta
            </div>
            <div>
              <h3 style={{ margin: 0, color: "#0e4b58" }}>Accetta i documenti aggiornati</h3>
              <p style={{ margin: "10px 0 0", color: "#41545c", lineHeight: 1.7 }}>{legalReasonMessage}</p>
            </div>
            <div style={{ color: "#5b6d76", fontSize: 14 }}>
              Riferimento corrente: documenti aggiornati al {LEGAL_LAST_UPDATED_LABEL}.
            </div>
            <LegalLinks compact />
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <form action={acceptUpdatedLegalDocumentsAction}>
                <FormSubmitButton className="btn" pendingText="Confermo...">
                  Accetta e continua
                </FormSubmitButton>
              </form>
            </div>
          </section>
        </div>
      );
    }

    return (
      <div className="grid dashboard-page" style={{ gap: 24 }}>
        {legalMessage ? (
          <div className="card" style={getBannerStyles(legalMessage.tone)}>
            {legalMessage.message}
          </div>
        ) : null}
        {billingMessage ? (
          <div className="card" style={getBannerStyles(billingMessage.tone)}>
            {billingMessage.message}
          </div>
        ) : null}
        {trialMessage ? (
          <div className="card" style={getBannerStyles(trialMessage.tone)}>
            {trialMessage.message}
          </div>
        ) : null}
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="pill">Bentornato</div>
            <h2 style={{ margin: "8px 0 0", color: "#0e4b58" }}>{user.email}</h2>
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
              <div className="pill">Piano: {billingState.planType}</div>
              <div className="pill">
                Stato: {billingState.billingOverride === "friend_free" ? "omaggio attivo" : billingState.serviceActive ? billingState.status : "non attivo"}
              </div>
              {billingState.billingOverride === "friend_free" ? <div className="pill">Override: gratuito</div> : null}
            </div>
            {!billingState.serviceActive ? (
              <p style={{ margin: "8px 0 0", color: "#b42318", fontSize: 13 }}>
                Abbonamento non attivo: creazione, modifica, pubblicazione e link ospiti sono bloccati.
              </p>
            ) : null}
          </div>
          <div style={{ display: "grid", gap: 10, justifyItems: "flex-end" }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {!hasActiveGiftOverride ? (
                <form action="/api/stripe/checkout" method="post">
                  <button className="btn" type="submit">
                    {billingState.serviceActive ? "Aggiorna piano" : "Attiva abbonamento"}
                  </button>
                </form>
              ) : null}
              {hasStripeCustomer ? (
                <form action="/api/stripe/portal" method="post">
                  <button className="btn btn-secondary" type="submit">
                    Gestisci abbonamento
                  </button>
                </form>
              ) : null}
              <form action="/api/auth/logout" method="post">
                <button className="btn btn-secondary" type="submit">
                  Logout
                </button>
              </form>
            </div>
            <p style={{ margin: 0, maxWidth: 470, color: "#5b6d76", fontSize: 13, lineHeight: 1.65, textAlign: "right" }}>
              L&apos;abbonamento e&apos; mensile con rinnovo automatico finche&apos; non lo annulli dal customer portal
              Stripe. Il prezzo puo&apos; riallinearsi in base al numero di strutture presenti nell&apos;account. Dettagli:
              {" "}
              <Link href="/termini" style={{ color: "#0e4b58", textDecoration: "underline" }}>
                Termini
              </Link>
              ,{" "}
              <Link href="/recesso" style={{ color: "#0e4b58", textDecoration: "underline" }}>
                Recesso
              </Link>
              ,{" "}
              <Link href="/privacy" style={{ color: "#0e4b58", textDecoration: "underline" }}>
                Privacy
              </Link>{" "}
              e{" "}
              <Link href="/cookie" style={{ color: "#0e4b58", textDecoration: "underline" }}>
                Cookie
              </Link>
              .
            </p>
          </div>
        </header>

        <section className="grid" style={{ gap: 12 }}>
          <div className="pill">Le tue strutture</div>
          <div className="card">
            <form action={createPropertyAction} className="grid" style={{ gap: 12 }}>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
                <input name="name" placeholder="Nome struttura" required className="input" />
                <input name="address" placeholder="Indirizzo" className="input" />
                <input name="main_image_url" placeholder="URL immagine principale" className="input" />
                <input name="short_description" placeholder="Descrizione breve" className="input" />
              </div>
              <FormSubmitButton className="btn" pendingText="Aggiungo struttura...">
                Aggiungi struttura
              </FormSubmitButton>
            </form>
          </div>
          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Elenco strutture inserite</div>
            {(properties ?? []).length ? (
              <div
                style={{
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                  alignItems: "start"
                }}
              >
                {(properties ?? []).map((property: Database["public"]["Tables"]["properties"]["Row"]) => (
                  <div
                    key={property.id}
                    style={{
                      padding: 10,
                      borderRadius: 12,
                      border: "1px solid #d6e7ea",
                      background: "#f5fbfc",
                      display: "grid",
                      gap: 12
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                      <div style={{ fontWeight: 700, color: "#0e4b58" }}>{property.name}</div>
                      <div className="pill" style={{ background: "#e4f4f7", color: "#0e4b58" }}>
                        Struttura
                      </div>
                    </div>
                    <div className="grid" style={{ gap: 10 }}>
                      <form action={updatePropertyAction} className="grid" style={{ gap: 10 }}>
                        <input type="hidden" name="property_id" value={property.id} />
                        <input name="name" defaultValue={property.name ?? ""} className="input" placeholder="Nome struttura" />
                        <input name="address" defaultValue={property.address ?? ""} className="input" placeholder="Indirizzo" />
                        <div style={{ display: "grid", gap: 8 }}>
                          <div style={{ fontWeight: 600, color: "#0e4b58" }}>Immagine principale</div>
                          <PropertyImagePicker
                            initialUrl={propertyImageById.get(property.id) ?? property.main_image_url}
                            inputName="main_image_file"
                          />
                          <input type="hidden" name="main_image_url" defaultValue={property.main_image_url ?? ""} />
                        </div>
                        <textarea
                          name="short_description"
                          defaultValue={property.short_description ?? ""}
                          className="input"
                          placeholder="Descrizione breve"
                          rows={2}
                        />
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <FormSubmitButton className="btn btn-secondary" pendingText="Salvo modifiche...">
                            Salva modifiche
                          </FormSubmitButton>
                        </div>
                      </form>
                      <DeletePropertyButton propertyId={property.id} action={deletePropertyAction} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted">Nessuna struttura ancora inserita.</div>
            )}
          </div>
        </section>

        <section className="grid" style={{ gap: 12 }}>
          <div className="pill">I tuoi homebook</div>
          <div className="card">
            <form action={createHomebookAction} className="grid" style={{ gap: 12 }}>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
                <input name="title" placeholder="Titolo homebook" required className="input" />
                <select name="layout_type" className="input" defaultValue={DEFAULT_LAYOUT_ID}>
                  {LAYOUTS.map((layout) => (
                    <option key={layout.id} value={layout.id}>
                      {layout.name}
                    </option>
                  ))}
                </select>
                <select name="property_id" required className="input" defaultValue="">
                  <option value="" disabled>
                    Seleziona struttura
                  </option>
                  {(properties ?? []).map((property: Database["public"]["Tables"]["properties"]["Row"]) => (
                    <option key={property.id} value={property.id}>
                      {property.name}
                    </option>
                  ))}
                </select>
              </div>
              <FormSubmitButton className="btn" pendingText="Creo homebook...">
                Crea homebook
              </FormSubmitButton>
            </form>
          </div>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            {(homebooks ?? []).map((homebook: any) => (
              <div key={homebook.id} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <div className="pill">{homebook.layout_type}</div>
                      <div
                        className="pill"
                        style={{
                          background: homebook.is_published ? "#e6f4e8" : "#fdecec",
                          color: homebook.is_published ? "#1b5e20" : "#475569"
                        }}
                      >
                        {homebook.is_published ? "Pubblicato" : "Bozza"}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, marginTop: 8 }}>{homebook.title}</div>
                    <div className="structure-summary">
                      <span className="structure-summary__label">Struttura:</span>
                      <span className="structure-summary__name">
                        {homebook.properties?.name ?? "Nome struttura"}
                      </span>
                    </div>
                  </div>
                  <div
                    className="homebook-actions"
                    style={{ display: "flex", gap: 8, flexDirection: "column", alignItems: "flex-end" }}
                  >
                    <Link className="btn btn-secondary homebook-action" href={`/homebooks/${homebook.id}/edit`}>
                      Modifica
                    </Link>
                    <DeleteHomebookButton homebookId={homebook.id} action={deleteHomebookAction} />
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <div className="text-muted">Link ospiti</div>
                  {homebook.public_access_token ? (
                    <code style={{ background: "#0d1424", padding: "6px 8px", borderRadius: 8 }}>
                      {`${SITE_URL}/p/${homebook.public_slug}?t=${homebook.public_access_token}`}
                    </code>
                  ) : (
                    <div className="text-muted">Link non disponibile. Rigenera per crearne uno.</div>
                  )}
                  <PublicLinkActions
                    url={
                      homebook.public_access_token
                        ? `${SITE_URL}/p/${homebook.public_slug}?t=${homebook.public_access_token}`
                        : ""
                    }
                    isEnabled={homebook.public_access_enabled !== false}
                    isPublished={homebook.is_published}
                    homebookId={homebook.id}
                    rotateAction={rotatePublicAccessTokenAction}
                    toggleAction={setPublicAccessEnabledAction}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="card" style={{ display: "grid", gap: 12, marginTop: 96 }}>
            <div>
              <div style={{ fontWeight: 700, color: "#0e4b58" }}>Esplora tutti i layout</div>
              <div className="text-muted" style={{ marginTop: 6 }}>
                Clicca un layout per vedere un&apos;anteprima rapida e capire quale stile si adatta meglio alla tua struttura.
              </div>
            </div>
            <DashboardLayoutShowcase layouts={LAYOUTS} />
          </div>
        </section>
      </div>
    );
  } catch (err) {
    if (isNextRedirectError(err)) {
      throw err;
    }
    console.error("Dashboard load error", err);
    const errorMessage = err instanceof Error ? err.message : "Errore inatteso";
    return (
      <div className="grid" style={{ gap: 12 }}>
        <div className="pill">Dashboard</div>
        <div className="card" style={{ color: "#b42318" }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Impossibile caricare la dashboard</div>
          <div style={{ color: "#0e4b58" }}>
            Controlla la connessione a Supabase o riprova più tardi.
          </div>
          <div style={{ color: "#8a2d2d", marginTop: 8, fontSize: 13 }}>{errorMessage}</div>
        </div>
      </div>
    );
  }
}





