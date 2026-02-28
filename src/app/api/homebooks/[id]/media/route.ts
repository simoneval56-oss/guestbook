import { NextResponse } from "next/server";
import { createAdminClient, createServerSupabaseClient } from "../../../../../lib/supabase/server";
import { createSignedUrlMapForValues, resolveStorageValueWithSignedMap } from "../../../../../lib/storage-media";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authClient = createServerSupabaseClient();
    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id: homebookId } = await params;
    const url = new URL(request.url);
    const sectionId = url.searchParams.get("section_id");
    if (!homebookId || !sectionId) {
      return NextResponse.json({ error: "missing_params" }, { status: 400 });
    }

    const admin = createAdminClient() as any;
    const { data: homebook, error: homebookError } = await admin
      .from("homebooks")
      .select("id, property_id")
      .eq("id", homebookId)
      .single();
    if (homebookError || !homebook) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const { data: property, error: propertyError } = await admin
      .from("properties")
      .select("id, user_id")
      .eq("id", homebook.property_id)
      .single();
    if (propertyError || !property) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (property.user_id !== authData.user.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 403 });
    }

    const { data: section, error: sectionError } = await admin
      .from("sections")
      .select("id")
      .eq("id", sectionId)
      .eq("homebook_id", homebookId)
      .single();
    if (sectionError || !section) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const { data: subsections, error: subsError } = await admin
      .from("subsections")
      .select("id")
      .eq("section_id", sectionId);
    if (subsError) {
      throw subsError;
    }
    const subsectionIds = (subsections ?? [])
      .map((sub: { id: string }) => sub.id)
      .filter((id: string | null | undefined): id is string => Boolean(id));

    const selectFields = "id, section_id, subsection_id, url, type, order_index, description, created_at";
    let mediaQuery = admin.from("media").select(selectFields);
    if (subsectionIds.length) {
      const orFilters = [`section_id.eq.${sectionId}`, `subsection_id.in.(${subsectionIds.join(",")})`];
      mediaQuery = mediaQuery.or(orFilters.join(","));
    } else {
      mediaQuery = mediaQuery.eq("section_id", sectionId);
    }
    const { data: media, error: mediaError } = await mediaQuery
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: true });
    if (mediaError) {
      throw mediaError;
    }
    const signedUrlMap = await createSignedUrlMapForValues(
      admin,
      (media ?? []).map((item: { url?: string | null }) => item.url ?? null)
    );
    const resolvedMedia = (media ?? []).map((item: any) => ({
      ...item,
      url: resolveStorageValueWithSignedMap(item.url, signedUrlMap) ?? item.url
    }));

    return NextResponse.json({
      data: {
        section_id: sectionId,
        subsection_ids: subsectionIds,
        media: resolvedMedia
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "unknown_error" }, { status: 500 });
  }
}
