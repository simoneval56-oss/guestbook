import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabase/server";
import { requireUser } from "../utils/auth";
import { Database } from "../../../lib/database.types";

export async function GET() {
  try {
    const user = await requireUser();
    const supabase = createAdminClient();
    const propertiesQuery = supabase.from("properties").select("*").order("created_at", { ascending: false });
    const { data, error } = await (propertiesQuery as any).eq("user_id", user.id);
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
    const payload: Database["public"]["Tables"]["properties"]["Insert"] = {
      user_id: user.id,
      name: body.name,
      address: body.address ?? null,
      main_image_url: body.main_image_url ?? null,
      short_description: body.short_description ?? null
    };
    const { data, error } = await (supabase.from("properties") as any).insert(payload).select("*").single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
