import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient, createServerSupabaseClient } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveBaseUrl(request: Request) {
  const configured = process.env.NEXT_PUBLIC_BASE_URL;
  if (configured && configured.trim()) return configured.trim().replace(/\/+$/, "");
  try {
    return new URL(request.url).origin;
  } catch {
    return "http://localhost:3000";
  }
}

function asNonEmpty(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  return normalized.length ? normalized : null;
}

export async function POST(request: Request) {
  const baseUrl = resolveBaseUrl(request);
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.redirect(new URL("/login", baseUrl), { status: 303 });
  }

  const stripeSecretKey = asNonEmpty(process.env.STRIPE_SECRET_KEY);
  if (!stripeSecretKey) {
    return NextResponse.redirect(new URL("/dashboard?billing=portal_not_configured", baseUrl), { status: 303 });
  }

  const admin = createAdminClient() as any;
  const { data: billingUser, error: billingUserError } = await admin
    .from("users")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (billingUserError || !billingUser?.stripe_customer_id) {
    return NextResponse.redirect(new URL("/dashboard?billing=portal_unavailable", baseUrl), { status: 303 });
  }

  const stripe = new Stripe(stripeSecretKey);
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: billingUser.stripe_customer_id,
      return_url: `${baseUrl}/dashboard?billing=portal_return`
    });
    return NextResponse.redirect(session.url, { status: 303 });
  } catch {
    return NextResponse.redirect(new URL("/dashboard?billing=portal_error", baseUrl), { status: 303 });
  }
}
