import Image from "next/image";
import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { createAdminClient, createServerSupabaseClient } from "../../../lib/supabase/server";
import { ClassicoEditorPreview } from "../../../components/classico-editor-preview";
import {
  AuroraLayout,
  BoutiqueLayout,
  EssenzialeLayout,
  SectionBlock
} from "../../../components/homebook-layouts";
import { PublicOfflineManager } from "../../../components/public-offline-manager";
import { Database } from "../../../lib/database.types";
import { getLayoutById } from "../../../lib/layouts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = {
  params: { slug: string };
  searchParams?: { t?: string | string[]; debug?: string | string[] };
};

type SectionRow = Database["public"]["Tables"]["sections"]["Row"];
type SubsectionRow = Database["public"]["Tables"]["subsections"]["Row"];
type MediaRow = Database["public"]["Tables"]["media"]["Row"];
type HomebookRecord = Database["public"]["Tables"]["homebooks"]["Row"] & {
  properties: Pick<
    Database["public"]["Tables"]["properties"]["Row"],
    "name" | "address" | "main_image_url" | "short_description" | "user_id"
  > | null;
};

type SectionPreview = Pick<SectionRow, "id" | "title" | "order_index" | "visible">;
type SubsectionPreview = Pick<
  SubsectionRow,
  "id" | "section_id" | "content_text" | "visible" | "order_index" | "created_at"
>;
type MediaPreview = Pick<
  MediaRow,
  "id" | "section_id" | "subsection_id" | "url" | "type" | "order_index" | "description" | "created_at"
>;

function groupBy<T extends Record<string, any>>(items: T[], key: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item);
    acc[k] = acc[k] ?? [];
    acc[k].push(item);
    return acc;
  }, {});
}

function parseSubContent(raw: string | null | undefined) {
  const safe = raw ?? "";
  try {
    const parsed = JSON.parse(safe);
    if (parsed && typeof parsed.title === "string" && typeof parsed.body === "string") {
      return { title: parsed.title, body: parsed.body };
    }
  } catch (e) {
    // ignore parsing errors
  }
  const trimmed = safe.trim();
  const title = trimmed.split("\n")[0] || trimmed;
  return { title, body: safe };
}

function parseSubTitle(raw: string | null | undefined) {
  const safe = raw ?? "";
  try {
    const parsed = JSON.parse(safe);
    if (parsed && typeof parsed.title === "string") {
      return parsed.title;
    }
  } catch (e) {
    // ignore parsing errors
  }
  return safe.trim().split("\n")[0] || safe;
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function ensureIllustrativoColazioneSectionPublic(
  admin: any,
  layoutType: string,
  homebookId: string,
  sections: SectionPreview[]
): Promise<SectionPreview[]> {
  if (layoutType !== "illustrativo" || !sections.length) return sections;
  const hasColazione = sections.some((section) => normalizeKey(section.title) === "colazione");
  if (hasColazione) return sections;

  const regoleSection = sections.find((section) => normalizeKey(section.title) === "regole struttura");
  const insertIndex = (regoleSection?.order_index ?? 5) + 1;
  const toShift = sections
    .filter((section) => section.order_index >= insertIndex)
    .sort((a, b) => b.order_index - a.order_index);

  for (const section of toShift) {
    const nextIndex = section.order_index + 1;
    const { error } = await admin.from("sections").update({ order_index: nextIndex }).eq("id", section.id);
    if (!error) {
      section.order_index = nextIndex;
    }
  }

  const { data, error } = await admin
    .from("sections")
    .insert({
      homebook_id: homebookId,
      title: "Colazione",
      order_index: insertIndex
    })
    .select("id, title, order_index, visible")
    .single();

  if (error || !data) return sections;

  const updated: SectionPreview[] = [
    ...sections,
    {
      id: data.id,
      title: data.title,
      order_index: data.order_index,
      visible: data.visible ?? null
    }
  ];

  return updated.sort((a, b) => a.order_index - b.order_index);
}

async function ensureModernoColazioneSectionPublic(
  admin: any,
  layoutType: string,
  homebookId: string,
  sections: SectionPreview[]
): Promise<SectionPreview[]> {
  if (layoutType !== "moderno" || !sections.length) return sections;
  const hasColazione = sections.some((section) => normalizeKey(section.title) === "colazione");
  if (hasColazione) return sections;

  const regoleSection = sections.find((section) => normalizeKey(section.title) === "regole struttura");
  const insertIndex = (regoleSection?.order_index ?? 5) + 1;
  const toShift = sections
    .filter((section) => section.order_index >= insertIndex)
    .sort((a, b) => b.order_index - a.order_index);

  for (const section of toShift) {
    const nextIndex = section.order_index + 1;
    const { error } = await admin.from("sections").update({ order_index: nextIndex }).eq("id", section.id);
    if (!error) {
      section.order_index = nextIndex;
    }
  }

  const { data, error } = await admin
    .from("sections")
    .insert({
      homebook_id: homebookId,
      title: "Colazione",
      order_index: insertIndex
    })
    .select("id, title, order_index, visible")
    .single();

  if (error || !data) return sections;

  const updated: SectionPreview[] = [
    ...sections,
    {
      id: data.id,
      title: data.title,
      order_index: data.order_index,
      visible: data.visible ?? null
    }
  ];

  return updated.sort((a, b) => a.order_index - b.order_index);
}

async function ensureOroColazioneSectionPublic(
  admin: any,
  layoutType: string,
  homebookId: string,
  sections: SectionPreview[]
): Promise<SectionPreview[]> {
  if (layoutType !== "oro" || !sections.length) return sections;
  const hasColazione = sections.some((section) => normalizeKey(section.title) === "colazione");
  if (hasColazione) return sections;

  const regoleSection = sections.find((section) => normalizeKey(section.title) === "regole struttura");
  const insertIndex = (regoleSection?.order_index ?? 5) + 1;
  const toShift = sections
    .filter((section) => section.order_index >= insertIndex)
    .sort((a, b) => b.order_index - a.order_index);

  for (const section of toShift) {
    const nextIndex = section.order_index + 1;
    const { error } = await admin.from("sections").update({ order_index: nextIndex }).eq("id", section.id);
    if (!error) {
      section.order_index = nextIndex;
    }
  }

  const { data, error } = await admin
    .from("sections")
    .insert({
      homebook_id: homebookId,
      title: "Colazione",
      order_index: insertIndex
    })
    .select("id, title, order_index, visible")
    .single();

  if (error || !data) return sections;

  const updated: SectionPreview[] = [
    ...sections,
    {
      id: data.id,
      title: data.title,
      order_index: data.order_index,
      visible: data.visible ?? null
    }
  ];

  return updated.sort((a, b) => a.order_index - b.order_index);
}

const SUBSECTION_ORDER_RAW: Record<string, string[]> = {
  "check-in": ["Prima di partire", "Orario", "Formalità", "Self check-in", "Check-in in presenza"],
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
  "funzionamento": ["Accesso struttura", "Parcheggio", "Biancheria", "Rifiuti", "Wi-Fi", "Climatizzatore", "Riscaldamento"],
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
  "numeri utili": ["Accoglienza", "Guardia medica", "Farmacia", "Ambulanza", "Polizia", "Vigili del fuoco", "Taxi"],
  "check-out": ["Orario", "Pulizie", "Inventario", "Chiavi"]
};

const SUBSECTION_ORDER_BY_SECTION: Record<string, string[]> = Object.fromEntries(
  Object.entries(SUBSECTION_ORDER_RAW).map(([section, subs]) => [
    normalizeKey(section),
    subs.map((sub) => normalizeKey(sub))
  ])
);

function sortSubsections(sectionTitle: string, list: SubsectionPreview[]) {
  const sectionKey = normalizeKey(sectionTitle);
  const sectionOrder = SUBSECTION_ORDER_BY_SECTION[sectionKey] ?? [];
  const hasManualOrder = list.some((sub) => sub.order_index !== null && sub.order_index !== undefined);
  return [...list].sort((a, b) => {
    if (hasManualOrder) {
      const orderA = a.order_index ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.order_index ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
    } else {
      const orderA = sectionOrder.indexOf(normalizeKey(parseSubTitle(a.content_text)));
      const orderB = sectionOrder.indexOf(normalizeKey(parseSubTitle(b.content_text)));
      const fallbackA = orderA === -1 ? Number.MAX_SAFE_INTEGER : orderA;
      const fallbackB = orderB === -1 ? Number.MAX_SAFE_INTEGER : orderB;
      if (fallbackA !== fallbackB) return fallbackA - fallbackB;
    }
    const timeA = a.created_at ? Date.parse(a.created_at) : 0;
    const timeB = b.created_at ? Date.parse(b.created_at) : 0;
    return timeA - timeB;
  });
}

export default async function PublicHomebookPage({ params, searchParams }: Props) {
  noStore();
  const rawSlug = params.slug ?? "";
  let slug = rawSlug;
  let resolvedToken = typeof searchParams?.t === "string" ? searchParams.t.trim() : "";
  if (!resolvedToken && searchParams && typeof (searchParams as any).get === "function") {
    resolvedToken = ((searchParams as any).get("t") as string | null)?.trim() ?? "";
  }
  let debugFlag = typeof searchParams?.debug === "string" ? searchParams.debug.trim() : "";
  if (!debugFlag && searchParams && typeof (searchParams as any).get === "function") {
    debugFlag = ((searchParams as any).get("debug") as string | null)?.trim() ?? "";
  }
  if (!resolvedToken && rawSlug.includes("?")) {
    const [base, queryString] = rawSlug.split("?");
    slug = base;
    const parsed = new URLSearchParams(queryString);
    resolvedToken = parsed.get("t")?.trim() ?? "";
  }
  if (process.env.NODE_ENV === "development" && debugFlag === "1") {
    return (
      <pre style={{ padding: 24 }}>
        {JSON.stringify(
          {
            rawSlug,
            slug,
            tokenLength: resolvedToken.length,
            hasSearchParamsGet: Boolean(searchParams && typeof (searchParams as any).get === "function"),
            debugFlag,
            searchParams
          },
          null,
          2
        )}
      </pre>
    );
  }
  if (!resolvedToken) {
    notFound();
  }
  const anonSupabase = createServerSupabaseClient({
    extraHeaders: {
      "x-homebook-token": resolvedToken
    }
  }) as any;
  const { data: homebookData } = await anonSupabase
    .from("homebooks")
    .select("id, title, layout_type, is_published, properties(name,address,main_image_url,short_description,user_id)")
    .eq("public_slug", slug)
    .eq("public_access_token", resolvedToken)
    .eq("public_access_enabled", true)
    .eq("is_published", true)
    .single();
  let resolvedHomebook = homebookData as HomebookRecord | null;
  let dataClient: any = anonSupabase;

  if (!resolvedHomebook && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const adminSupabase = createAdminClient() as any;
    const { data: adminHomebook } = await adminSupabase
      .from("homebooks")
      .select("id, title, layout_type, is_published, properties(name,address,main_image_url,short_description,user_id)")
      .eq("public_slug", slug)
      .eq("public_access_token", resolvedToken)
      .eq("public_access_enabled", true)
      .eq("is_published", true)
      .single();
    if (adminHomebook) {
      resolvedHomebook = adminHomebook as HomebookRecord;
      dataClient = adminSupabase;
    }
  }

  const homebook = resolvedHomebook;

  if (!homebook || !homebook.is_published) {
    notFound();
  }

  let allowOfflineCache = true;
  const ownerId = homebook.properties?.user_id ?? null;
  if (!ownerId) {
    allowOfflineCache = false;
  } else {
    const ownerClient = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : dataClient;
    const { data: owner } = await ownerClient
      .from("users")
      .select("subscription_status")
      .eq("id", ownerId)
      .maybeSingle();
    const status = owner?.subscription_status ?? null;
    const isTrial = !status || status === "trial";
    allowOfflineCache = !isTrial;
  }

  const { data: sections, error: sectionsError } = await dataClient
    .from("sections")
    .select("id, title, order_index, visible")
    .eq("homebook_id", homebook.id)
    .or("visible.is.null,visible.eq.true")
    .order("order_index", { ascending: true });

  let resolvedSections =
    sections ??
    ((sectionsError
      ? (
          await dataClient
            .from("sections")
            .select("id, title, order_index")
            .eq("homebook_id", homebook.id)
            .or("visible.is.null,visible.eq.true")
            .order("order_index", { ascending: true })
        ).data ?? []
      : []) as any);

  const adminForUpdates =
    (homebook.layout_type === "illustrativo" ||
      homebook.layout_type === "moderno" ||
      homebook.layout_type === "oro") &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createAdminClient()
      : null;
  if (adminForUpdates) {
    resolvedSections = await ensureIllustrativoColazioneSectionPublic(
      adminForUpdates,
      homebook.layout_type,
      homebook.id,
      resolvedSections as SectionPreview[]
    );
    resolvedSections = await ensureModernoColazioneSectionPublic(
      adminForUpdates,
      homebook.layout_type,
      homebook.id,
      resolvedSections as SectionPreview[]
    );
    resolvedSections = await ensureOroColazioneSectionPublic(
      adminForUpdates,
      homebook.layout_type,
      homebook.id,
      resolvedSections as SectionPreview[]
    );
  }

  const sectionIds = (resolvedSections ?? []).map((section: { id: string }) => section.id).filter(Boolean);

  const { data: subsections, error: subsError } = sectionIds.length
    ? await dataClient
        .from("subsections")
        .select("id, section_id, content_text, visible, order_index, created_at")
        .in("section_id", sectionIds)
        .or("visible.is.null,visible.eq.true")
        .order("created_at", { ascending: true })
    : { data: [], error: null };

  const resolvedSubsections =
    subsections ??
    ((subsError
      ? (
          await dataClient
            .from("subsections")
            .select("id, section_id, content_text, created_at")
            .in("section_id", sectionIds)
            .or("visible.is.null,visible.eq.true")
            .order("created_at", { ascending: true })
        ).data ?? []
      : []) as any);

  const subsectionIds = (resolvedSubsections ?? []).map((sub: { id: string }) => sub.id).filter(Boolean);
  let media: any[] = [];
  let mediaError: any = null;
  if (sectionIds.length || subsectionIds.length) {
    let mediaQuery = dataClient
      .from("media")
      .select("id, section_id, subsection_id, url, type, order_index, description, created_at");
    if (sectionIds.length && subsectionIds.length) {
      mediaQuery = mediaQuery.or(
        `section_id.in.(${sectionIds.join(",")}),subsection_id.in.(${subsectionIds.join(",")})`
      );
    } else if (sectionIds.length) {
      mediaQuery = mediaQuery.in("section_id", sectionIds);
    } else if (subsectionIds.length) {
      mediaQuery = mediaQuery.in("subsection_id", subsectionIds);
    }
    const result = await mediaQuery
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: true });
    media = result.data ?? [];
    mediaError = result.error ?? null;
  }
  if (mediaError) {
    const fallback = await dataClient
      .from("media")
      .select("id, section_id, subsection_id, url, type, created_at")
      .order("created_at", { ascending: true });
    media = fallback.data ?? [];
  }

  const offlineAssets = Array.from(
    new Set(
      [
        homebook.properties?.main_image_url ?? null,
        ...(media ?? [])
          .filter((item: { type?: string }) => item.type === "image" || item.type === "file")
          .map((item: { url?: string | null }) => item.url ?? null)
      ].filter(Boolean)
    )
  ) as string[];

  const castSections = (resolvedSections ?? []) as SectionPreview[];
  const castSubsections = (resolvedSubsections ?? []) as SubsectionPreview[];
  const castMedia = (media ?? []) as MediaPreview[];

  const isVisible = (value?: boolean | null) => value !== false;
  const visibleSections = castSections.filter((section) => isVisible(section.visible));
  const subsectionsBySection = groupBy(
    castSubsections.filter((sub) => isVisible(sub.visible)),
    (row) => row.section_id
  );
  const mediaByParent = groupBy(castMedia, (row) => row.section_id ?? row.subsection_id ?? "");
  Object.keys(mediaByParent).forEach((key) => {
    mediaByParent[key] = [...mediaByParent[key]].sort((a, b) => {
      const orderA = a.order_index ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.order_index ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      const timeA = a.created_at ? Date.parse(a.created_at) : 0;
      const timeB = b.created_at ? Date.parse(b.created_at) : 0;
      return timeA - timeB;
    });
  });

  const filteredSections: SectionBlock[] = castSections
    .filter((section) => isVisible(section.visible))
    .map((section) => ({
      id: section.id,
      title: section.title,
      order: section.order_index,
      media: mediaByParent[section.id] ?? [],
      subsections: sortSubsections(section.title, subsectionsBySection[section.id] ?? [])
        .map((sub) => {
          const parsed = parseSubContent(sub.content_text);
          return {
            id: sub.id,
            title: parsed.title,
            content: parsed.body,
            media: mediaByParent[sub.id] ?? []
          };
        })
    }));

  const structuredSections: SectionBlock[] =
    filteredSections.length === 0 && castSections.length > 0
      ? castSections.map((section) => ({
          id: section.id,
          title: section.title,
          order: section.order_index,
          media: mediaByParent[section.id] ?? [],
          subsections: sortSubsections(section.title, castSubsections.filter((s) => s.section_id === section.id) ?? [])
            .map((sub) => {
              const parsed = parseSubContent(sub.content_text);
              return {
                id: sub.id,
                title: parsed.title,
                content: parsed.body,
                media: mediaByParent[sub.id] ?? []
              };
            })
        }))
      : filteredSections;

  const layoutMeta = getLayoutById(homebook.layout_type);
  const isGridPreview = ["classico", "moderno", "illustrativo", "pastello", "oro"].includes(layoutMeta.id);
  const previewPageClass =
    layoutMeta.id === "classico"
      ? "classico-editor-page"
      : layoutMeta.id === "moderno"
      ? "moderno-editor-page"
      : layoutMeta.id === "illustrativo"
      ? "illustrativo-editor-page"
      : layoutMeta.id === "pastello"
      ? "pastello-editor-page"
      : layoutMeta.id === "oro"
      ? "oro-editor-page"
      : "";
  const coverImage = homebook.properties?.main_image_url ?? null;
  const heroTitle = homebook.properties?.name ?? homebook.title;
  const heroSubtitle = homebook.properties?.short_description ?? "";
  const heroAddress = homebook.properties?.address ?? "";

  const layoutProps = {
    homebook: {
      title: homebook.title,
      layoutType: layoutMeta.id,
      property: {
        name: homebook.properties?.name ?? null,
        address: homebook.properties?.address ?? null,
        mainImageUrl: homebook.properties?.main_image_url ?? null,
        shortDescription: homebook.properties?.short_description ?? null
      }
    },
    sections: structuredSections
  };

  const renderLayout = () => {
    if (isGridPreview) {
      return (
        <div className={`public-homebook public-homebook--${layoutMeta.id} ${previewPageClass}`}>
          <section className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div
              style={{
                position: "relative",
                minHeight: 320,
                aspectRatio: "16 / 9",
                background: "linear-gradient(120deg, #e6edef, #dce8ec)",
                borderRadius: "16px 16px 0 0",
                overflow: "hidden"
              }}
            >
              {coverImage ? (
                <Image
                  src={coverImage}
                  alt=""
                  fill
                  sizes="(max-width: 900px) 100vw, 1200px"
                  style={{ objectFit: "cover" }}
                  priority
                  unoptimized
                />
              ) : (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "grid",
                    placeItems: "center"
                  }}
                >
                  <div
                    style={{
                      width: 120,
                      height: 120,
                      borderRadius: "24px",
                      border: "2px dashed rgba(37, 74, 84, 0.4)",
                      display: "grid",
                      placeItems: "center",
                      color: "#254a54",
                      background: "rgba(255,255,255,0.55)"
                    }}
                  >
                    <span style={{ fontSize: 18, fontWeight: 700 }}>Foto copertina</span>
                  </div>
                </div>
              )}
            </div>
            <div className="public-homebook-cover__body">
              <h2 className="public-homebook-cover__title">{heroTitle}</h2>
              <div className="public-homebook-cover__meta">
                {heroAddress ? <p className="public-homebook-cover__address">{heroAddress}</p> : null}
                {heroSubtitle ? <p className="public-homebook-cover__description">{heroSubtitle}</p> : null}
              </div>
            </div>
          </section>
          <ClassicoEditorPreview
            sections={visibleSections}
            subsectionsBySection={subsectionsBySection}
            mediaByParent={mediaByParent}
            layoutName={layoutMeta.id}
            readOnly
          />
        </div>
      );
    }

    switch (layoutMeta.template) {
      case "essenziale":
        return <EssenzialeLayout {...layoutProps} />;
      case "boutique":
        return <BoutiqueLayout {...layoutProps} />;
      case "aurora":
      default:
        return <AuroraLayout {...layoutProps} />;
    }
  };

  return (
    <div className="public-homebook-wrapper">
      <PublicOfflineManager assets={offlineAssets} homebookId={homebook.id} enabled={allowOfflineCache} />
      {renderLayout()}
    </div>
  );
}

