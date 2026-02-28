import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabase/server";
import { requireUser } from "../utils/auth";
import { Database } from "../../../lib/database.types";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const supabase = createAdminClient();
    const homebookId = typeof body.homebook_id === "string" ? body.homebook_id.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!homebookId || !title) {
      return NextResponse.json({ error: "missing_required_fields" }, { status: 400 });
    }

    const { data: homebook, error: homebookError } = await (supabase.from("homebooks") as any)
      .select("id, property_id")
      .eq("id", homebookId)
      .maybeSingle();
    if (homebookError) throw homebookError;
    if (!homebook) {
      return NextResponse.json({ error: "homebook_not_found" }, { status: 404 });
    }

    const { data: property, error: propertyError } = await (supabase.from("properties") as any)
      .select("id, user_id")
      .eq("id", homebook.property_id)
      .maybeSingle();
    if (propertyError) throw propertyError;
    if (!property) {
      return NextResponse.json({ error: "property_not_found" }, { status: 404 });
    }
    if (property.user_id !== user.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const parsedOrderIndex = Number.parseInt(String(body.order_index ?? 1), 10);
    const orderIndex = Number.isFinite(parsedOrderIndex) && parsedOrderIndex > 0 ? parsedOrderIndex : 1;

    const payload: Database["public"]["Tables"]["sections"]["Insert"] = {
      homebook_id: homebookId,
      title,
      order_index: orderIndex
    };
    const { data, error } = await (supabase.from("sections") as any).insert(payload).select("*").single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error: any) {
    const status = error?.message === "unauthorized" ? 401 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
}
