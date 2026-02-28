import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient, createServerSupabaseClient } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

const VERSION_RETENTION = 10;

type PublishAction = "publish" | "draft" | "restore_latest_published";

type HomebookSnapshot = {
  homebook: {
    title: string;
    layout_type: string;
  };
  property: {
    name: string;
    address: string | null;
    main_image_url: string | null;
    short_description: string | null;
  };
  sections: Array<{
    id: string;
    title: string;
    order_index: number;
    visible: boolean | null;
  }>;
  subsections: Array<{
    id: string;
    section_id: string;
    content_text: string;
    visible: boolean | null;
    order_index: number | null;
    created_at: string | null;
  }>;
  media: Array<{
    id: string;
    section_id: string | null;
    subsection_id: string | null;
    url: string;
    type: string;
    order_index: number | null;
    description: string | null;
    created_at: string | null;
  }>;
};

function asAction(value: unknown): PublishAction | null {
  if (value === "publish" || value === "draft" || value === "restore_latest_published") {
    return value;
  }
  return null;
}

async function requireOwnedHomebook(admin: any, userId: string, homebookId: string) {
  const { data: homebook, error } = await admin
    .from("homebooks")
    .select("id, title, layout_type, public_slug, property_id, properties!inner(id, user_id)")
    .eq("id", homebookId)
    .single();

  if (error || !homebook) {
    throw new Error("not_found");
  }
  if (homebook.properties?.user_id !== userId) {
    throw new Error("forbidden");
  }
  return homebook;
}

async function captureSnapshot(admin: any, homebook: any): Promise<HomebookSnapshot> {
  const { data: property, error: propertyError } = await admin
    .from("properties")
    .select("name, address, main_image_url, short_description")
    .eq("id", homebook.property_id)
    .single();
  if (propertyError || !property) {
    throw new Error("property_not_found");
  }

  const { data: sectionsRaw, error: sectionsError } = await admin
    .from("sections")
    .select("id, title, order_index, visible")
    .eq("homebook_id", homebook.id)
    .order("order_index", { ascending: true });
  if (sectionsError) {
    throw new Error("sections_load_failed");
  }
  const sections = sectionsRaw ?? [];
  const sectionIds = sections.map((section: any) => section.id).filter(Boolean);

  const { data: subsectionsRaw, error: subsectionsError } = sectionIds.length
    ? await admin
        .from("subsections")
        .select("id, section_id, content_text, visible, order_index, created_at")
        .in("section_id", sectionIds)
        .order("created_at", { ascending: true })
    : { data: [], error: null };
  if (subsectionsError) {
    throw new Error("subsections_load_failed");
  }
  const subsections = subsectionsRaw ?? [];
  const subsectionIds = subsections.map((sub: any) => sub.id).filter(Boolean);

  let media: any[] = [];
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
    const { data: mediaRaw, error: mediaError } = await mediaQuery
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: true });
    if (mediaError) {
      throw new Error("media_load_failed");
    }
    media = mediaRaw ?? [];
  }

  return {
    homebook: {
      title: homebook.title,
      layout_type: homebook.layout_type
    },
    property: {
      name: property.name,
      address: property.address ?? null,
      main_image_url: property.main_image_url ?? null,
      short_description: property.short_description ?? null
    },
    sections: sections.map((section: any) => ({
      id: section.id,
      title: section.title,
      order_index: section.order_index,
      visible: section.visible ?? null
    })),
    subsections: subsections.map((sub: any) => ({
      id: sub.id,
      section_id: sub.section_id,
      content_text: sub.content_text ?? "",
      visible: sub.visible ?? null,
      order_index: sub.order_index ?? null,
      created_at: sub.created_at ?? null
    })),
    media: media.map((item: any) => ({
      id: item.id,
      section_id: item.section_id ?? null,
      subsection_id: item.subsection_id ?? null,
      url: item.url,
      type: item.type,
      order_index: item.order_index ?? null,
      description: item.description ?? null,
      created_at: item.created_at ?? null
    }))
  };
}

async function insertPublishedVersion(admin: any, homebookId: string, userId: string, snapshot: HomebookSnapshot) {
  const { data: lastVersion } = await admin
    .from("homebook_versions")
    .select("version_no")
    .eq("homebook_id", homebookId)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersionNo = (lastVersion?.version_no ?? 0) + 1;
  const { data: inserted, error: insertError } = await admin
    .from("homebook_versions")
    .insert({
      homebook_id: homebookId,
      version_no: nextVersionNo,
      snapshot,
      created_by: userId
    })
    .select("id, version_no")
    .single();
  if (insertError || !inserted) {
    throw new Error("version_insert_failed");
  }

  const { data: allVersions } = await admin
    .from("homebook_versions")
    .select("id")
    .eq("homebook_id", homebookId)
    .order("created_at", { ascending: false });

  const staleIds = (allVersions ?? []).slice(VERSION_RETENTION).map((item: { id: string }) => item.id);
  if (staleIds.length) {
    await admin.from("homebook_versions").delete().in("id", staleIds);
  }

  return inserted.version_no as number;
}

async function restoreFromSnapshot(admin: any, homebookId: string, snapshot: HomebookSnapshot) {
  const { data: homebook } = await admin
    .from("homebooks")
    .select("property_id")
    .eq("id", homebookId)
    .single();
  if (!homebook?.property_id) {
    throw new Error("homebook_not_found");
  }

  const { error: propertyError } = await admin
    .from("properties")
    .update({
      name: snapshot.property.name,
      address: snapshot.property.address,
      main_image_url: snapshot.property.main_image_url,
      short_description: snapshot.property.short_description
    })
    .eq("id", homebook.property_id);
  if (propertyError) {
    throw new Error("property_restore_failed");
  }

  const { error: homebookError } = await admin
    .from("homebooks")
    .update({
      title: snapshot.homebook.title,
      layout_type: snapshot.homebook.layout_type
    })
    .eq("id", homebookId);
  if (homebookError) {
    throw new Error("homebook_restore_failed");
  }

  const { data: currentSections } = await admin
    .from("sections")
    .select("id")
    .eq("homebook_id", homebookId);
  const currentSectionIds = (currentSections ?? []).map((section: { id: string }) => section.id);
  let currentSubsectionIds: string[] = [];
  if (currentSectionIds.length) {
    const { data: currentSubsections } = await admin
      .from("subsections")
      .select("id")
      .in("section_id", currentSectionIds);
    currentSubsectionIds = (currentSubsections ?? []).map((sub: { id: string }) => sub.id);
  }

  if (currentSubsectionIds.length) {
    await admin.from("media").delete().in("subsection_id", currentSubsectionIds);
  }
  if (currentSectionIds.length) {
    await admin.from("media").delete().in("section_id", currentSectionIds);
    await admin.from("subsections").delete().in("section_id", currentSectionIds);
  }
  await admin.from("sections").delete().eq("homebook_id", homebookId);

  const sectionIdMap = new Map<string, string>();
  const orderedSections = [...(snapshot.sections ?? [])].sort((a, b) => a.order_index - b.order_index);
  for (const section of orderedSections) {
    const { data, error } = await admin
      .from("sections")
      .insert({
        homebook_id: homebookId,
        title: section.title,
        order_index: section.order_index,
        visible: section.visible ?? null
      })
      .select("id")
      .single();
    if (error || !data?.id) {
      throw new Error("section_restore_failed");
    }
    sectionIdMap.set(section.id, data.id);
  }

  const subsectionIdMap = new Map<string, string>();
  const orderedSubsections = [...(snapshot.subsections ?? [])].sort((a, b) => {
    const orderA = a.order_index ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.order_index ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    const timeA = a.created_at ? Date.parse(a.created_at) : 0;
    const timeB = b.created_at ? Date.parse(b.created_at) : 0;
    return timeA - timeB;
  });
  for (const subsection of orderedSubsections) {
    const sectionId = sectionIdMap.get(subsection.section_id);
    if (!sectionId) continue;

    const { data, error } = await admin
      .from("subsections")
      .insert({
        section_id: sectionId,
        content_text: subsection.content_text ?? "",
        visible: subsection.visible ?? null,
        order_index: subsection.order_index ?? null
      })
      .select("id")
      .single();
    if (error || !data?.id) {
      throw new Error("subsection_restore_failed");
    }
    subsectionIdMap.set(subsection.id, data.id);
  }

  const orderedMedia = [...(snapshot.media ?? [])].sort((a, b) => {
    const orderA = a.order_index ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.order_index ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    const timeA = a.created_at ? Date.parse(a.created_at) : 0;
    const timeB = b.created_at ? Date.parse(b.created_at) : 0;
    return timeA - timeB;
  });
  for (const item of orderedMedia) {
    const mappedSectionId = item.section_id ? sectionIdMap.get(item.section_id) ?? null : null;
    const mappedSubsectionId = item.subsection_id ? subsectionIdMap.get(item.subsection_id) ?? null : null;
    if (!mappedSectionId && !mappedSubsectionId) continue;

    const { error } = await admin.from("media").insert({
      section_id: mappedSectionId,
      subsection_id: mappedSubsectionId,
      url: item.url,
      type: item.type,
      order_index: item.order_index ?? null,
      description: item.description ?? null
    });
    if (error) {
      throw new Error("media_restore_failed");
    }
  }
}

function revalidateHomebookViews(homebookId: string, slug?: string | null) {
  revalidatePath("/dashboard");
  revalidatePath(`/homebooks/${homebookId}/edit`);
  if (slug) {
    revalidatePath(`/p/${slug}`);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const body = await request.json().catch(() => ({}));
    const action = asAction(body?.action);
    if (!action) {
      return NextResponse.json({ error: "invalid_action" }, { status: 400 });
    }

    const admin = createAdminClient() as any;
    const homebook = await requireOwnedHomebook(admin, user.id, homebookId);

    if (action === "draft") {
      const { error } = await admin.from("homebooks").update({ is_published: false }).eq("id", homebookId);
      if (error) {
        throw new Error("draft_update_failed");
      }
      revalidateHomebookViews(homebookId, homebook.public_slug ?? null);
      return NextResponse.json({ data: { action, is_published: false } });
    }

    if (action === "publish") {
      const snapshot = await captureSnapshot(admin, homebook);
      const versionNo = await insertPublishedVersion(admin, homebookId, user.id, snapshot);
      const { error } = await admin.from("homebooks").update({ is_published: true }).eq("id", homebookId);
      if (error) {
        throw new Error("publish_update_failed");
      }
      revalidateHomebookViews(homebookId, homebook.public_slug ?? null);
      return NextResponse.json({
        data: {
          action,
          is_published: true,
          version_no: versionNo
        }
      });
    }

    const { data: latestVersion } = await admin
      .from("homebook_versions")
      .select("id, version_no, snapshot")
      .eq("homebook_id", homebookId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestVersion?.snapshot) {
      return NextResponse.json({ error: "no_published_version_snapshot" }, { status: 404 });
    }

    await restoreFromSnapshot(admin, homebookId, latestVersion.snapshot as HomebookSnapshot);
    const { error: publishError } = await admin
      .from("homebooks")
      .update({ is_published: true })
      .eq("id", homebookId);
    if (publishError) {
      throw new Error("restore_publish_failed");
    }

    revalidateHomebookViews(homebookId, homebook.public_slug ?? null);
    return NextResponse.json({
      data: {
        action,
        is_published: true,
        restored_version_no: latestVersion.version_no ?? null
      }
    });
  } catch (error: any) {
    const message = error?.message ?? "unknown_error";
    const status =
      message === "forbidden"
        ? 403
        : message === "not_found"
        ? 404
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
