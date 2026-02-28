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

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CLASSICO_DEFAULT_SUBSECTIONS = ["Prima di partire", "Orario", "FormalitÃ ", "Self check-in", "Check-in in presenza"];
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

async function createPropertyAction(formData: FormData) {
  "use server";
  const supabase = createServerSupabaseClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  // Ensure the user exists in public.users (needed for FK on properties)
  const userPayload: Database["public"]["Tables"]["users"]["Insert"] = {
    id: session.user.id,
    email: session.user.email ?? ""
  };
  await (supabase.from("users") as any).upsert(userPayload, { onConflict: "id" });

  const name = formData.get("name")?.toString() ?? "";
  const address = formData.get("address")?.toString() ?? "";
  const main_image_url = formData.get("main_image_url")?.toString() ?? null;
  const short_description = formData.get("short_description")?.toString() ?? null;

  if (!name) return;

  const propertyPayload: Database["public"]["Tables"]["properties"]["Insert"] = {
    user_id: session.user.id,
    name,
    address,
    main_image_url,
    short_description
  };

  await (supabase.from("properties") as any).insert(propertyPayload);

  revalidatePath("/dashboard");
}

async function updatePropertyAction(formData: FormData) {
  "use server";
  const supabase = createServerSupabaseClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session) redirect("/login");

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
  if (!property || property.user_id !== session.user.id) return;

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
  const supabase = createServerSupabaseClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const property_id = formData.get("property_id")?.toString() ?? "";
  if (!property_id) return;

  const { data: property } = await (supabase.from("properties") as any)
    .select("id, user_id")
    .eq("id", property_id)
    .single();
  if (!property || property.user_id !== session.user.id) return;

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

  revalidatePath("/dashboard");
}

async function createHomebookAction(formData: FormData) {
  "use server";
  const supabase = createServerSupabaseClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const property_id = formData.get("property_id")?.toString() ?? "";
  const title = formData.get("title")?.toString() ?? "";
  const layout_type = formData.get("layout_type")?.toString() || DEFAULT_LAYOUT_ID;

  if (!property_id || !title) return;

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
  const supabase = createServerSupabaseClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const homebook_id = formData.get("homebook_id")?.toString() ?? "";
  if (!homebook_id) return;

  const { data: homebook } = await (supabase.from("homebooks") as any)
    .select("id, property_id, properties(user_id)")
    .eq("id", homebook_id)
    .single();

  if (!homebook || (homebook as any).properties?.user_id !== session.user.id) {
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
  const supabase = createServerSupabaseClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const homebook_id = formData.get("homebook_id")?.toString() ?? "";
  if (!homebook_id) return;

  const { data: homebook } = await (supabase.from("homebooks") as any)
    .select("id, properties(user_id)")
    .eq("id", homebook_id)
    .single();

  if (!homebook || (homebook as any).properties?.user_id !== session.user.id) return;

  await (supabase.from("homebooks") as any)
    .update({ public_access_token: generatePublicAccessToken() })
    .eq("id", homebook_id);

  revalidatePath("/dashboard");
}

async function setPublicAccessEnabledAction(formData: FormData) {
  "use server";
  const supabase = createServerSupabaseClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const homebook_id = formData.get("homebook_id")?.toString() ?? "";
  const enabled = formData.get("public_access_enabled")?.toString() === "true";
  if (!homebook_id) return;

  const { data: homebook } = await (supabase.from("homebooks") as any)
    .select("id, properties(user_id)")
    .eq("id", homebook_id)
    .single();

  if (!homebook || (homebook as any).properties?.user_id !== session.user.id) return;

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

export default async function DashboardPage() {
  const supabase = createServerSupabaseClient();
  try {
    const {
      data: { session }
    } = await withTimeout(supabase.auth.getSession(), "Sessione");

    if (!session) {
      redirect("/login");
    }

    const { data: properties } = await withTimeout(
      (supabase.from("properties") as any).select("*").order("created_at", {
        ascending: false
      }),
      "ProprietÃ "
    );

    const { data: homebooks } = await withTimeout(
      (supabase.from("homebooks") as any)
        .select("*, properties(name)")
        .order("created_at", { ascending: false }),
      "Homebook"
    );
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

    return (
      <div className="grid dashboard-page" style={{ gap: 24 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="pill">Bentornato</div>
            <h2 style={{ margin: "8px 0 0", color: "#0e4b58" }}>{session.user.email}</h2>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <Link className="btn btn-secondary" href="/api/auth/logout">
              Logout
            </Link>
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
              <button className="btn" type="submit">
                Aggiungi struttura
              </button>
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
                          <button className="btn btn-secondary" type="submit">
                            Salva modifiche
                          </button>
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
              <button className="btn" type="submit">
                Crea homebook
              </button>
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
                      {`${process.env.NEXT_PUBLIC_BASE_URL ?? "https://homebook.app"}/p/${homebook.public_slug}?t=${
                        homebook.public_access_token
                      }`}
                    </code>
                  ) : (
                    <div className="text-muted">Link non disponibile. Rigenera per crearne uno.</div>
                  )}
                  <PublicLinkActions
                    url={
                      homebook.public_access_token
                        ? `${process.env.NEXT_PUBLIC_BASE_URL ?? "https://homebook.app"}/p/${homebook.public_slug}?t=${
                            homebook.public_access_token
                          }`
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
    console.error("Dashboard load error", err);
    const errorMessage = err instanceof Error ? err.message : "Errore inatteso";
    return (
      <div className="grid" style={{ gap: 12 }}>
        <div className="pill">Dashboard</div>
        <div className="card" style={{ color: "#b42318" }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Impossibile caricare la dashboard</div>
          <div style={{ color: "#0e4b58" }}>
            Controlla la connessione a Supabase o riprova piÃ¹ tardi.
          </div>
          <div style={{ color: "#8a2d2d", marginTop: 8, fontSize: 13 }}>{errorMessage}</div>
        </div>
      </div>
    );
  }
}





