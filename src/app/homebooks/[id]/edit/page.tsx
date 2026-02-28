import { Buffer } from "node:buffer";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import Image from "next/image";
import { createServerSupabaseClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/server";
import { getDefaultSections } from "../../../../lib/default-sections";
import { DEFAULT_LAYOUT_ID } from "../../../../lib/layouts";
import { OwnerPreviewToggle } from "../../../../components/owner-preview-toggle";
import { PublishControls } from "../../../../components/publish-controls";
import { Database } from "../../../../lib/database.types";
import { COVER_FILE_ACCEPT, validateUploadCandidate } from "../../../../lib/upload-limits";
import { createSignedUrlMapForValues, resolveStorageValueWithSignedMap } from "../../../../lib/storage-media";
import type { MediaItem, Section, Subsection } from "../../../../components/classico-editor-preview";

const CLASSICO_DEFAULT_SUBSECTIONS = [
  "Prima di partire",
  "Orario",
  "Formalità",
  "Self check-in",
  "Check-in in presenza"
];

const CLASSICO_LIKE_LAYOUTS = new Set([
  "classico",
  "rustico",
  "mediterraneo",
  "moderno",
  "illustrativo",
  "pastello",
  "oro",
  "romantico",
  "futuristico",
  "notturno"
]);

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
  colazione: ["Colazione"],
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

type Props = { params: Promise<{ id: string }> };

type SectionPreview = Section;
type SubsectionPreview = Subsection & { section_id: string };
type MediaPreview = MediaItem & { created_at: string | null };

function groupBy<T extends Record<string, any>>(items: T[], key: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item);
    acc[k] = acc[k] ?? [];
    acc[k].push(item);
    return acc;
  }, {});
}

async function updatePropertyDetailsAction(formData: FormData) {
  "use server";
  const supabase = createServerSupabaseClient() as any;
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
  const homebook_id = formData.get("homebook_id")?.toString() ?? "";

  if (!property_id || !homebook_id || !name) return;

  const { data: property } = await supabase
    .from("properties")
    .select("id, user_id")
    .eq("id", property_id)
    .single();

  if (!property || property.user_id !== session.user.id) return;

  const uploadedUrl =
    main_image_file instanceof File && main_image_file.size > 0
      ? await uploadImageToStorage(main_image_file as File, `properties/${property_id}`)
      : null;

  await supabase
    .from("properties")
    .update({
      name: name || property_id,
      address: address || null,
      main_image_url: uploadedUrl || main_image_url || null,
      short_description: short_description || null
    })
    .eq("id", property_id);

  const { data: homebook } = await supabase
    .from("homebooks")
    .select("is_published")
    .eq("id", homebook_id)
    .single();

  if (homebook?.is_published) {
    await supabase.from("homebooks").update({ is_published: false }).eq("id", homebook_id);
  }

  revalidatePath(`/homebooks/${homebook_id}/edit`);
}

async function ensureDefaultSubsectionsForClassicLayouts(
  supabase: any,
  layout_type: string,
  sections:
    | {
        id: string;
        title: string;
      }[]
    | null
) {
  if (!sections) return;
  const isClassicLike = CLASSICO_LIKE_LAYOUTS.has(layout_type);
  const useColazioneBodyOnly =
    isClassicLike &&
    (layout_type === "pastello" ||
      layout_type === "illustrativo" ||
      layout_type === "moderno" ||
      layout_type === "oro");
  const sectionDefaults = isClassicLike ? CLASSICO_EXTRA_SECTIONS : { colazione: ["Colazione"] };
  const inserts: Database["public"]["Tables"]["subsections"]["Insert"][] = [];
  for (const [sectionTitle, subs] of Object.entries(sectionDefaults)) {
    const match = sections.find((s) => normalizeTitle(s.title) === normalizeTitle(sectionTitle));
    if (!match) continue;
    const { count } = await supabase
      .from("subsections")
      .select("id", { head: true, count: "exact" })
      .eq("section_id", match.id);
    if ((count ?? 0) > 0) continue;
    subs.forEach((label) => {
      const content_text =
        useColazioneBodyOnly && normalizeTitle(sectionTitle) === "colazione"
          ? JSON.stringify({ title: label, body: "" })
          : label;
      inserts.push({
        section_id: match.id,
        content_text
      });
    });
  }

  if (inserts.length) {
    await supabase.from("subsections").insert(inserts);
  }
}

async function ensurePastelloColazioneSection(
  admin: any,
  layout_type: string,
  homebookId: string,
  sections: SectionPreview[]
): Promise<SectionPreview[]> {
  if (layout_type !== "pastello" || !sections.length) return sections;
  const hasColazione = sections.some((section) => normalizeTitle(section.title) === "colazione");
  if (hasColazione) return sections;

  const regoleSection = sections.find((section) => normalizeTitle(section.title) === "regole struttura");
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

async function ensureIllustrativoColazioneSection(
  admin: any,
  layout_type: string,
  homebookId: string,
  sections: SectionPreview[]
): Promise<SectionPreview[]> {
  if (layout_type !== "illustrativo" || !sections.length) return sections;
  const hasColazione = sections.some((section) => normalizeTitle(section.title) === "colazione");
  if (hasColazione) return sections;

  const regoleSection = sections.find((section) => normalizeTitle(section.title) === "regole struttura");
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

async function ensureModernoColazioneSection(
  admin: any,
  layout_type: string,
  homebookId: string,
  sections: SectionPreview[]
): Promise<SectionPreview[]> {
  if (layout_type !== "moderno" || !sections.length) return sections;
  const hasColazione = sections.some((section) => normalizeTitle(section.title) === "colazione");
  if (hasColazione) return sections;

  const regoleSection = sections.find((section) => normalizeTitle(section.title) === "regole struttura");
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

async function ensureOroColazioneSection(
  admin: any,
  layout_type: string,
  homebookId: string,
  sections: SectionPreview[]
): Promise<SectionPreview[]> {
  if (layout_type !== "oro" || !sections.length) return sections;
  const hasColazione = sections.some((section) => normalizeTitle(section.title) === "colazione");
  if (hasColazione) return sections;

  const regoleSection = sections.find((section) => normalizeTitle(section.title) === "regole struttura");
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

async function ensureExtraColazioneSection(
  admin: any,
  layout_type: string,
  homebookId: string,
  sections: SectionPreview[]
): Promise<SectionPreview[]> {
  if (layout_type !== "futuristico" && layout_type !== "romantico") return sections;
  const hasColazione = sections.some((section) => normalizeTitle(section.title) === "colazione");
  if (hasColazione) return sections;

  const regoleSection = sections.find((section) => normalizeTitle(section.title) === "regole struttura");
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

const STORAGE_BUCKET = "homebook-media";

async function uploadImageToStorage(file: File | null, pathPrefix: string) {
  if (!file || typeof file.arrayBuffer !== "function" || file.size === 0) return null;
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

export default async function EditHomebookPage({ params }: Props) {
  const { id: homebookId } = await params;
  const supabase = createServerSupabaseClient() as any;
  const admin = createAdminClient() as any;
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const { data: homebook } = await supabase
    .from("homebooks")
    .select("*, properties(name, main_image_url, short_description, user_id)")
    .eq("id", homebookId)
    .single();

  if (!homebook || homebook.properties?.user_id !== session.user.id) {
    notFound();
  }

  const layoutType =
    (homebook.layout_type ?? DEFAULT_LAYOUT_ID).toString().trim().toLowerCase() || DEFAULT_LAYOUT_ID;

  const { data: sections, error: sectionsError } = await admin
    .from("sections")
    .select("id, title, order_index, visible")
    .eq("homebook_id", homebook.id)
    .order("order_index", { ascending: true });

  // fallback se la colonna visible manca o la query fallisce
  const fallbackSections =
    sections ??
    (sectionsError
      ? (
          await admin
            .from("sections")
            .select("id, title, order_index")
            .eq("homebook_id", homebook.id)
            .order("order_index", { ascending: true })
        ).data ?? []
      : []);
  let resolvedSections: SectionPreview[] = (fallbackSections ?? []).map((section: any) => ({
    id: section.id,
    title: section.title,
    order_index: section.order_index,
    visible: section.visible ?? null
  }));

  resolvedSections = await ensurePastelloColazioneSection(admin, layoutType, homebook.id, resolvedSections);
  resolvedSections = await ensureIllustrativoColazioneSection(admin, layoutType, homebook.id, resolvedSections);
  resolvedSections = await ensureModernoColazioneSection(admin, layoutType, homebook.id, resolvedSections);
  resolvedSections = await ensureOroColazioneSection(admin, layoutType, homebook.id, resolvedSections);
  resolvedSections = await ensureExtraColazioneSection(admin, layoutType, homebook.id, resolvedSections);

  const sectionIds = resolvedSections.map((section) => section.id).filter(Boolean);

  await ensureDefaultSubsectionsForClassicLayouts(supabase, layoutType, resolvedSections);

  const { data: subsections, error: subsError } = sectionIds.length
    ? await admin
        .from("subsections")
        .select("id, section_id, content_text, visible, order_index, created_at")
        .in("section_id", sectionIds)
        .order("created_at", { ascending: true })
    : { data: [], error: null };

  const fallbackSubsections =
    subsections ??
    (subsError
      ? (await admin
          .from("subsections")
          .select("id, section_id, content_text, created_at")
          .in("section_id", sectionIds)
          .order("created_at", { ascending: true })
        ).data ?? []
      : []);
  const resolvedSubsections: SubsectionPreview[] = (fallbackSubsections ?? []).map((sub: any) => ({
    id: sub.id,
    section_id: sub.section_id,
    content_text: sub.content_text ?? null,
    visible: sub.visible ?? null,
    order_index: sub.order_index ?? null,
    created_at: sub.created_at ?? null
  }));

  const subsectionIds = resolvedSubsections.map((sub) => sub.id).filter(Boolean);
  let media: MediaPreview[] = [];
  let mediaError: any = null;
  if (sectionIds.length || subsectionIds.length) {
    let mediaQuery = admin
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
    media = (result.data ?? []).map((item: any) => ({
      id: item.id,
      section_id: item.section_id ?? null,
      subsection_id: item.subsection_id ?? null,
      url: item.url,
      type: item.type,
      order_index: item.order_index ?? null,
      description: item.description ?? null,
      created_at: item.created_at ?? null
    }));
    mediaError = result.error ?? null;
  }
  if (mediaError) {
    const fallback = await admin
      .from("media")
      .select("id, section_id, subsection_id, url, type, created_at")
      .order("created_at", { ascending: true });
    media = (fallback.data ?? []).map((item: any) => ({
      id: item.id,
      section_id: item.section_id ?? null,
      subsection_id: item.subsection_id ?? null,
      url: item.url,
      type: item.type,
      order_index: null,
      description: null,
      created_at: item.created_at ?? null
    }));
  }
  const signedValueMap = await createSignedUrlMapForValues(
    admin,
    [homebook.properties?.main_image_url ?? null, ...media.map((item) => item.url)]
  );
  const resolvedCoverImage = resolveStorageValueWithSignedMap(
    homebook.properties?.main_image_url ?? null,
    signedValueMap
  );
  const resolvedMedia = media.map((item) => ({
    ...item,
    url: resolveStorageValueWithSignedMap(item.url, signedValueMap) ?? item.url
  }));

  const subsBySection = groupBy(resolvedSubsections, (row) => row.section_id) as Record<string, Subsection[]>;
  const mediaByParent = groupBy(resolvedMedia, (row) => row.section_id ?? row.subsection_id ?? "") as Record<
    string,
    MediaPreview[]
  >;
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
  const castSections: Section[] = resolvedSections.map((section) => ({
    id: section.id,
    title: section.title,
    order_index: section.order_index,
    visible: section.visible ?? null
  }));

  const pageClass =
    layoutType === "classico"
      ? "classico-editor-page"
      : layoutType === "rustico"
      ? "rustico-editor-page"
      : layoutType === "mediterraneo"
      ? "rustico-editor-page mediterraneo-editor-page"
      : layoutType === "moderno"
      ? "moderno-editor-page"
      : layoutType === "illustrativo"
      ? "illustrativo-editor-page"
      : layoutType === "pastello"
      ? "pastello-editor-page"
      : layoutType === "futuristico"
      ? "futuristico-editor-page"
      : layoutType === "notturno"
      ? "notturno-editor-page"
      : layoutType === "oro"
      ? "oro-editor-page"
      : layoutType === "romantico"
      ? "romantico-editor-page"
      : "";

  return (
    <div className={`grid ${pageClass}`} style={{ gap: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <Link href="/dashboard">{"<- Dashboard"}</Link>
          <h1 style={{ margin: "8px 0 0" }}>{homebook.title}</h1>
          <div className="structure-summary">
            <span className="structure-summary__label">Struttura:</span>
            <span className="structure-summary__name">
              {homebook.properties?.name ?? "Nome struttura"}
            </span>
            <span className="structure-summary__layout">Layout: {layoutType}</span>
          </div>
        </div>
        <PublishControls homebookId={homebook.id} initialIsPublished={homebook.is_published} />
      </header>
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
            {resolvedCoverImage ? (
              <Image
                src={resolvedCoverImage}
                alt={`Foto copertina di ${homebook.properties?.name ?? "struttura"}`}
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
            <form
              action={updatePropertyDetailsAction}
              style={{
                position: "absolute",
                inset: 16,
                display: "grid",
                gap: 12,
                maxWidth: 320
              }}
            >
              <input type="hidden" name="property_id" value={homebook.property_id} />
              <input type="hidden" name="homebook_id" value={homebook.id} />
              <label className="grid" style={{ gap: 6 }}>
                <span style={{ fontWeight: 600 }}>URL foto copertina</span>
                <input
                  className="input"
                  name="main_image_url"
                  defaultValue={homebook.properties?.main_image_url ?? ""}
                  placeholder="https://..."
                />
              </label>
              <label className="grid" style={{ gap: 6 }}>
                <span style={{ fontWeight: 600 }}>Oppure carica dal tuo PC</span>
                <input className="input" type="file" name="main_image_file" accept={COVER_FILE_ACCEPT} />
                <span className="text-muted" style={{ fontSize: 12 }}>
                  Se selezioni un file (JPG/PNG/WEBP, max 12MB), verrà usato al posto dell&apos;URL.
                </span>
              </label>
              <label className="grid" style={{ gap: 6 }}>
                <span style={{ fontWeight: 600 }}>Nome della casa</span>
                <input
                  className="input"
                  name="name"
                  defaultValue={homebook.properties?.name ?? ""}
                  placeholder="Es. Villa Kalithea"
                  required
                />
              </label>
              <label className="grid" style={{ gap: 6 }}>
                <span style={{ fontWeight: 600 }}>Indirizzo</span>
                <input
                  className="input"
                  name="address"
                  defaultValue={homebook.properties?.address ?? ""}
                  placeholder="Es. Via della Marineria 10"
                />
              </label>
              <label className="grid" style={{ gap: 6 }}>
                <span style={{ fontWeight: 600 }}>Descrizione breve</span>
                <textarea
                  className="input"
                  name="short_description"
                  defaultValue={homebook.properties?.short_description ?? ""}
                  placeholder="Testo descrittivo della struttura"
                  rows={3}
                />
              </label>
              <button className="btn btn-secondary" type="submit">
                Aggiorna cover
              </button>
            </form>
          </div>
        <div style={{ padding: "20px 20px 12px" }}>
          <h2 style={{ margin: "0 0 8px", fontFamily: "Playfair Display, serif", fontWeight: 600, fontStyle: "italic" }}>
            {homebook.properties?.name || "Nome struttura"}
          </h2>
          {homebook.properties?.address ? (
            <p className="text-muted" style={{ margin: "0 0 6px" }}>
              {homebook.properties.address}
            </p>
          ) : null}
          <p className="text-muted" style={{ margin: 0 }}>
            {homebook.properties?.short_description || "Aggiungi una descrizione per vedere l&apos;anteprima."}
          </p>
        </div>
      </section>

      <section className="card">
        <div className="pill">Sezioni predefinite del layout</div>
        <p className="text-muted" style={{ margin: "8px 0 0" }}>
          Le sezioni sono già impostate dal layout: aggiungi contenuti direttamente nei popup delle sottosezioni.
        </p>
        {sections?.length === 0 ? (
          <p className="text-muted" style={{ marginTop: 10 }}>
            Una volta che le sezioni verranno popolate dalle sottosezioni interattive, qui si rifletterà lo stato attuale.
          </p>
        ) : null}
      </section>

      {["classico", "rustico", "mediterraneo", "moderno", "illustrativo", "pastello", "oro", "romantico", "futuristico", "notturno"].includes(layoutType) &&
      (sections?.length ?? 0) > 0 ? (
        <OwnerPreviewToggle
          sections={castSections}
          subsectionsBySection={subsBySection}
          mediaByParent={mediaByParent}
          layoutName={layoutType}
          homebookId={homebook.id}
          isPublished={homebook.is_published}
        />
      ) : null}

    </div>
  );
}
