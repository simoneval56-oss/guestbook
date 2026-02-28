import { NextResponse } from "next/server";
import { createAdminClient, createServerSupabaseClient } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

type ChecklistItem = {
  id: string;
  message: string;
};

const CORE_SECTION_KEYS = ["check-in", "regole struttura", "funzionamento", "numeri utili"];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSubsectionBody(raw: string | null | undefined) {
  const safe = raw ?? "";
  if (!safe.trim()) return "";

  try {
    const parsed = JSON.parse(safe);
    if (parsed && typeof parsed.body === "string") {
      return parsed.body.trim();
    }
  } catch {
    // ignore JSON parse errors and fallback to raw text
  }

  const lines = safe
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) return "";
  return lines.slice(1).join(" ").trim();
}

function isMeaningfulText(text: string) {
  return normalizeText(text).length >= 20;
}

function isVisible(value: boolean | null | undefined) {
  return value !== false;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authClient = createServerSupabaseClient();
    const {
      data: { user }
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id: homebookId } = await params;
    if (!homebookId) {
      return NextResponse.json({ error: "missing_homebook_id" }, { status: 400 });
    }

    const admin = createAdminClient() as any;

    const { data: homebook, error: homebookError } = await admin
      .from("homebooks")
      .select("id, title, property_id, properties!inner(id, user_id, main_image_url, short_description)")
      .eq("id", homebookId)
      .single();

    if (homebookError || !homebook) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (homebook.properties?.user_id !== user.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { data: sectionsRaw, error: sectionsError } = await admin
      .from("sections")
      .select("id, title, visible")
      .eq("homebook_id", homebookId)
      .order("order_index", { ascending: true });

    if (sectionsError) {
      throw sectionsError;
    }

    const sections = (sectionsRaw ?? []).filter((section: any) => isVisible(section.visible));
    const sectionIds: string[] = sections.map((section: any) => section.id).filter(Boolean);

    const { data: subsectionsRaw, error: subsectionsError } = sectionIds.length
      ? await admin
          .from("subsections")
          .select("id, section_id, content_text, visible")
          .in("section_id", sectionIds)
      : { data: [], error: null };

    if (subsectionsError) {
      throw subsectionsError;
    }

    const subsections = (subsectionsRaw ?? []).filter((sub: any) => isVisible(sub.visible));
    const subsectionIds: string[] = subsections.map((sub: any) => sub.id).filter(Boolean);

    let media: any[] = [];
    if (sectionIds.length || subsectionIds.length) {
      let mediaQuery = admin.from("media").select("id, section_id, subsection_id");
      if (sectionIds.length && subsectionIds.length) {
        mediaQuery = mediaQuery.or(
          `section_id.in.(${sectionIds.join(",")}),subsection_id.in.(${subsectionIds.join(",")})`
        );
      } else if (sectionIds.length) {
        mediaQuery = mediaQuery.in("section_id", sectionIds);
      } else if (subsectionIds.length) {
        mediaQuery = mediaQuery.in("subsection_id", subsectionIds);
      }
      const { data: mediaRaw, error: mediaError } = await mediaQuery;
      if (mediaError) {
        throw mediaError;
      }
      media = mediaRaw ?? [];
    }

    const subsectionBySection = new Map<string, any[]>();
    subsections.forEach((sub: any) => {
      const current = subsectionBySection.get(sub.section_id) ?? [];
      current.push(sub);
      subsectionBySection.set(sub.section_id, current);
    });

    const mediaCountByParent = new Map<string, number>();
    media.forEach((item: any) => {
      const key = item.section_id ?? item.subsection_id;
      if (!key) return;
      mediaCountByParent.set(key, (mediaCountByParent.get(key) ?? 0) + 1);
    });

    const suggestions: ChecklistItem[] = [];

    if (!homebook.properties?.main_image_url) {
      suggestions.push({
        id: "cover-missing",
        message: "Aggiungi un'immagine di copertina per rendere l'homebook piu chiaro agli ospiti."
      });
    }

    if (!isMeaningfulText(homebook.properties?.short_description ?? "")) {
      suggestions.push({
        id: "description-short",
        message: "Valuta una breve descrizione iniziale della struttura (almeno 1-2 frasi)."
      });
    }

    if (!sections.length) {
      suggestions.push({
        id: "sections-missing",
        message: "Non risultano sezioni visibili. Controlla la struttura dell'homebook."
      });
    }

    for (const coreKey of CORE_SECTION_KEYS) {
      const section = sections.find((item: any) => normalizeText(item.title) === coreKey);
      if (!section) {
        suggestions.push({
          id: `core-${coreKey}-missing`,
          message: `Valuta di includere la sezione "${coreKey}" per aiutare gli ospiti.`
        });
        continue;
      }

      const sectionSubs = subsectionBySection.get(section.id) ?? [];
      const meaningfulSubs = sectionSubs.filter((sub: any) => isMeaningfulText(parseSubsectionBody(sub.content_text)));
      const sectionMedia = mediaCountByParent.get(section.id) ?? 0;
      const subsectionMedia = sectionSubs.reduce((acc: number, sub: any) => acc + (mediaCountByParent.get(sub.id) ?? 0), 0);
      if (meaningfulSubs.length === 0 && sectionMedia + subsectionMedia === 0) {
        suggestions.push({
          id: `core-${coreKey}-empty`,
          message: `La sezione "${coreKey}" sembra ancora vuota. Puoi pubblicare comunque o completarla piu avanti.`
        });
      }
    }

    const totalMeaningfulSubsections = subsections.filter((sub: any) =>
      isMeaningfulText(parseSubsectionBody(sub.content_text))
    ).length;
    if (totalMeaningfulSubsections === 0 && media.length === 0) {
      suggestions.push({
        id: "global-content-missing",
        message: "Non risultano contenuti descrittivi o media. L'homebook potrebbe apparire incompleto."
      });
    }

    return NextResponse.json({
      data: {
        homebook_id: homebookId,
        suggestions,
        hasSuggestions: suggestions.length > 0,
        checked_at: new Date().toISOString()
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "checklist_failed" },
      { status: 500 }
    );
  }
}
