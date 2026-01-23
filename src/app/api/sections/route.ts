import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabase/server";
import { requireUser } from "../utils/auth";
import { Database } from "../../../lib/database.types";

export async function POST(request: Request) {
  try {
    await requireUser();
    const body = await request.json();
    const supabase = createAdminClient();
    const payload: Database["public"]["Tables"]["sections"]["Insert"] = {
      homebook_id: body.homebook_id,
      title: body.title,
      order_index: body.order_index ?? 1
    };
    const { data, error } = await (supabase.from("sections") as any).insert(payload).select("*").single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
