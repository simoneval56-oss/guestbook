import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabase/server";
import { requireUser } from "../utils/auth";
import { DEFAULT_LAYOUT_ID } from "../../../lib/layouts";
import { getDefaultSections } from "../../../lib/default-sections";
import { Database } from "../../../lib/database.types";
import { generatePublicAccessToken } from "../../../lib/homebook-access";

export async function GET() {
  try {
    const user = await requireUser();
    const supabase = createAdminClient();
    const homebooksQuery = supabase.from("homebooks").select("*, properties!inner(name,user_id)");
    // Supabase types don't expose joined column paths, use an untyped call for the join filter.
    const { data, error } = await (homebooksQuery as any).eq("properties.user_id", user.id);
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const supabase = createAdminClient();
    const public_slug = body.public_slug ?? crypto.randomUUID().replace(/-/g, "").slice(0, 10);
    const public_access_token = body.public_access_token ?? generatePublicAccessToken();
    const payload: Database["public"]["Tables"]["homebooks"]["Insert"] = {
      property_id: body.property_id,
      title: body.title,
      layout_type: body.layout_type ?? DEFAULT_LAYOUT_ID,
      public_slug,
      public_access_token,
      public_access_enabled: body.public_access_enabled ?? true,
      is_published: !!body.is_published
    };
    const { data, error } = await (supabase.from("homebooks") as any).insert(payload).select("*").single();
    if (error) throw error;
    const defaultSections: Database["public"]["Tables"]["sections"]["Insert"][] = getDefaultSections(
      data.layout_type
    ).map((section) => ({
      ...section,
      homebook_id: data.id
    }));
    if (defaultSections.length) {
      await (supabase.from("sections") as any).insert(defaultSections);
    }
    return NextResponse.json({ data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
