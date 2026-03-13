import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabase/server";
import { requireAcceptedUser, requireServiceUser } from "../utils/auth";
import { Database } from "../../../lib/database.types";
import { ensureUserBillingState } from "../../../lib/subscription";
import { syncStripeSubscriptionForUserSafely } from "../../../lib/stripe-subscription-sync";

export async function GET() {
  try {
    const user = await requireAcceptedUser();
    const supabase = createAdminClient();
    const propertiesQuery = supabase.from("properties").select("*").order("created_at", { ascending: false });
    const { data, error } = await (propertiesQuery as any).eq("user_id", user.id);
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error: any) {
    const status =
      error?.message === "legal_acceptance_required"
        ? 428
        : error?.message === "unauthorized"
        ? 401
        : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireServiceUser();
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
    const billingAfterCreate = await ensureUserBillingState(supabase, {
      userId: user.id,
      email: user.email ?? null,
      syncPlan: true
    });
    await syncStripeSubscriptionForUserSafely(supabase, {
      userId: user.id,
      email: user.email ?? null,
      propertyCount: billingAfterCreate.propertyCount,
      context: "api_properties_post"
    });
    return NextResponse.json({ data });
  } catch (error: any) {
    const status =
      error?.message === "subscription_inactive"
        ? 402
        : error?.message === "legal_acceptance_required"
        ? 428
        : error?.message === "unauthorized"
        ? 401
        : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
}
