import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient, createServerSupabaseClient } from "../../../../lib/supabase/server";
import { ensureUserBillingState } from "../../../../lib/subscription";
import { buildStripeLineItemsForPropertyCount, getStripePriceConfig } from "../../../../lib/stripe-pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIVE_OR_RECOVERABLE_STATUSES = new Set(["active", "trial", "past_due"]);

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
    return NextResponse.redirect(new URL("/dashboard?billing=checkout_not_configured", baseUrl), { status: 303 });
  }

  const admin = createAdminClient() as any;

  await ensureUserBillingState(admin, {
    userId: user.id,
    email: user.email ?? null,
    syncPlan: true
  });

  const { data: billingUser, error: billingUserError } = await admin
    .from("users")
    .select("id, email, subscription_status, stripe_customer_id, stripe_subscription_id, billing_override")
    .eq("id", user.id)
    .maybeSingle();

  if (billingUserError || !billingUser) {
    return NextResponse.redirect(new URL("/dashboard?billing=checkout_error", baseUrl), { status: 303 });
  }

  if ((billingUser.billing_override ?? "").toLowerCase() === "friend_free") {
    return NextResponse.redirect(new URL("/dashboard?billing=gift_active", baseUrl), { status: 303 });
  }

  const normalizedStatus = (billingUser.subscription_status ?? "").toLowerCase();
  const hasCustomer = Boolean(asNonEmpty(billingUser.stripe_customer_id));
  const hasSubscription = Boolean(asNonEmpty(billingUser.stripe_subscription_id));

  const stripe = new Stripe(stripeSecretKey);

  if (hasCustomer && hasSubscription && ACTIVE_OR_RECOVERABLE_STATUSES.has(normalizedStatus)) {
    try {
      const portal = await stripe.billingPortal.sessions.create({
        customer: billingUser.stripe_customer_id as string,
        return_url: `${baseUrl}/dashboard?billing=portal_return`
      });
      return NextResponse.redirect(portal.url, { status: 303 });
    } catch {
      return NextResponse.redirect(new URL("/dashboard?billing=portal_error", baseUrl), { status: 303 });
    }
  }

  const { count: propertyCountRaw, error: propertyCountError } = await admin
    .from("properties")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (propertyCountError) {
    return NextResponse.redirect(new URL("/dashboard?billing=checkout_error", baseUrl), { status: 303 });
  }

  const propertyCount = Math.max(propertyCountRaw ?? 0, 1);
  const priceConfig = getStripePriceConfig();
  if (!priceConfig) {
    return NextResponse.redirect(new URL("/dashboard?billing=checkout_not_configured", baseUrl), { status: 303 });
  }

  let lineItems: Array<{ price: string; quantity: number }>;
  try {
    lineItems = buildStripeLineItemsForPropertyCount(propertyCount, priceConfig);
  } catch {
    return NextResponse.redirect(new URL("/dashboard?billing=checkout_not_configured", baseUrl), { status: 303 });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      success_url: `${baseUrl}/dashboard?billing=checkout_success`,
      cancel_url: `${baseUrl}/dashboard?billing=checkout_cancel`,
      line_items: lineItems,
      allow_promotion_codes: true,
      client_reference_id: user.id,
      customer: asNonEmpty(billingUser.stripe_customer_id) ?? undefined,
      customer_email: asNonEmpty(billingUser.stripe_customer_id) ? undefined : user.email ?? undefined,
      metadata: {
        user_id: user.id,
        property_count: String(propertyCount)
      },
      subscription_data: {
        metadata: {
          user_id: user.id
        }
      }
    });

    if (!session.url) {
      return NextResponse.redirect(new URL("/dashboard?billing=checkout_error", baseUrl), { status: 303 });
    }

    return NextResponse.redirect(session.url, { status: 303 });
  } catch {
    return NextResponse.redirect(new URL("/dashboard?billing=checkout_error", baseUrl), { status: 303 });
  }
}
