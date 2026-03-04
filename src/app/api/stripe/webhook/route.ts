import { NextResponse } from "next/server";
import Stripe from "stripe";
import { Database } from "../../../../lib/database.types";
import { createAdminClient } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_TRIAL = "trial";
const STATUS_ACTIVE = "active";
const STATUS_EXPIRED = "expired";
const STATUS_PAST_DUE = "past_due";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type UsersRow = Database["public"]["Tables"]["users"]["Row"];
type UsersUpdate = Database["public"]["Tables"]["users"]["Update"];
type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

type UserLookup = {
  userId?: string | null;
  email?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
};

type SyncHints = {
  userId?: string | null;
  email?: string | null;
  customerId?: string | null;
};

function asNonEmptyString(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

function asUserId(value: unknown) {
  const maybeId = asNonEmptyString(value);
  if (!maybeId) return null;
  return UUID_PATTERN.test(maybeId) ? maybeId : null;
}

function unixToIso(value: number | null | undefined) {
  if (!value) return null;
  return new Date(value * 1000).toISOString();
}

function extractId(value: unknown) {
  if (typeof value === "string") {
    return asNonEmptyString(value);
  }
  if (value && typeof value === "object" && "id" in value) {
    return asNonEmptyString((value as { id?: unknown }).id);
  }
  return null;
}

function metadataUserId(metadata: Stripe.Metadata | null | undefined) {
  if (!metadata) return null;
  return (
    asUserId(metadata.user_id) ??
    asUserId(metadata.supabase_user_id) ??
    asUserId(metadata.guesthomebook_user_id) ??
    null
  );
}

function mapStripeStatus(status: Stripe.Subscription.Status) {
  if (status === "trialing") return STATUS_TRIAL;
  if (status === "active") return STATUS_ACTIVE;
  if (status === "past_due") return STATUS_PAST_DUE;
  return STATUS_EXPIRED;
}

function subscriptionPeriodEnd(subscription: Stripe.Subscription) {
  const itemPeriods = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((value) => Number.isFinite(value) && value > 0);

  if (!itemPeriods.length) {
    return null;
  }

  return Math.max(...itemPeriods);
}

function patchFromSubscription(subscription: Stripe.Subscription): UsersUpdate {
  const periodEnd = subscriptionPeriodEnd(subscription);
  const patch: UsersUpdate = {
    subscription_status: mapStripeStatus(subscription.status),
    subscription_ends_at: unixToIso(periodEnd ?? subscription.trial_end),
    stripe_subscription_id: subscription.id
  };
  const customerId = extractId(subscription.customer);
  if (customerId) {
    patch.stripe_customer_id = customerId;
  }

  if (subscription.status === "trialing") {
    patch.trial_ends_at = unixToIso(subscription.trial_end ?? periodEnd);
  }

  return patch;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  if (!invoice.parent || invoice.parent.type !== "subscription_details") {
    return null;
  }

  return extractId(invoice.parent.subscription_details?.subscription);
}

async function findUserByField(
  admin: SupabaseAdminClient,
  field: "id" | "email" | "stripe_customer_id" | "stripe_subscription_id",
  value: string
) {
  const { data, error } = await (admin.from("users") as any)
    .select(
      "id, email, subscription_status, plan_type, trial_ends_at, subscription_ends_at, stripe_customer_id, stripe_subscription_id, created_at"
    )
    .eq(field, value)
    .maybeSingle();

  if (error) {
    throw new Error(`stripe_user_lookup_failed:${field}:${error.message}`);
  }

  return (data as UsersRow | null) ?? null;
}

async function resolveUser(admin: SupabaseAdminClient, lookup: UserLookup) {
  const userId = asUserId(lookup.userId);
  if (userId) {
    const user = await findUserByField(admin, "id", userId);
    if (user) return user;
  }

  const subscriptionId = asNonEmptyString(lookup.subscriptionId);
  if (subscriptionId) {
    const user = await findUserByField(admin, "stripe_subscription_id", subscriptionId);
    if (user) return user;
  }

  const customerId = asNonEmptyString(lookup.customerId);
  if (customerId) {
    const user = await findUserByField(admin, "stripe_customer_id", customerId);
    if (user) return user;
  }

  const email = asNonEmptyString(lookup.email);
  if (email) {
    const user = await findUserByField(admin, "email", email);
    if (user) return user;
  }

  return null;
}

async function updateUser(admin: SupabaseAdminClient, userId: string, patch: UsersUpdate) {
  const payload = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  ) as UsersUpdate;

  if (!Object.keys(payload).length) {
    return;
  }

  const { error } = await (admin.from("users") as any).update(payload).eq("id", userId);
  if (error) {
    throw new Error(`stripe_user_update_failed:${error.message}`);
  }
}

async function syncBySubscription(
  admin: SupabaseAdminClient,
  subscription: Stripe.Subscription,
  hints: SyncHints = {}
) {
  const user = await resolveUser(admin, {
    userId: metadataUserId(subscription.metadata) ?? hints.userId ?? null,
    subscriptionId: subscription.id,
    customerId: extractId(subscription.customer) ?? hints.customerId ?? null,
    email: hints.email ?? null
  });

  if (!user) {
    console.warn("stripe_webhook_user_not_found_for_subscription", {
      subscriptionId: subscription.id,
      customerId: extractId(subscription.customer)
    });
    return;
  }

  await updateUser(admin, user.id, patchFromSubscription(subscription));
}

async function handleCheckoutCompleted(
  admin: SupabaseAdminClient,
  stripe: Stripe,
  session: Stripe.Checkout.Session
) {
  if (session.mode !== "subscription") {
    return;
  }

  const customerId = extractId(session.customer);
  const subscriptionId = extractId(session.subscription);
  const lookupUserId = asUserId(session.client_reference_id) ?? metadataUserId(session.metadata);
  const email =
    asNonEmptyString(session.customer_details?.email) ?? asNonEmptyString(session.customer_email);

  const user = await resolveUser(admin, {
    userId: lookupUserId,
    customerId,
    subscriptionId,
    email
  });

  if (!user) {
    console.warn("stripe_webhook_user_not_found_for_checkout_session", {
      sessionId: session.id,
      customerId,
      subscriptionId
    });
    return;
  }

  const patch: UsersUpdate = {};
  if (customerId) {
    patch.stripe_customer_id = customerId;
  }
  if (subscriptionId) {
    patch.stripe_subscription_id = subscriptionId;
  }

  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    Object.assign(patch, patchFromSubscription(subscription));
  }

  await updateUser(admin, user.id, patch);
}

async function handleInvoicePaid(admin: SupabaseAdminClient, stripe: Stripe, invoice: Stripe.Invoice) {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) {
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await syncBySubscription(admin, subscription, {
    customerId: extractId(invoice.customer),
    email: asNonEmptyString(invoice.customer_email)
  });
}

async function handleInvoicePaymentFailed(
  admin: SupabaseAdminClient,
  stripe: Stripe,
  invoice: Stripe.Invoice
) {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    await syncBySubscription(admin, subscription, {
      customerId: extractId(invoice.customer),
      email: asNonEmptyString(invoice.customer_email)
    });
    return;
  }

  const user = await resolveUser(admin, {
    customerId: extractId(invoice.customer),
    email: asNonEmptyString(invoice.customer_email)
  });

  if (!user) {
    return;
  }

  await updateUser(admin, user.id, {
    subscription_status: STATUS_PAST_DUE
  });
}

async function processEvent(admin: SupabaseAdminClient, stripe: Stripe, event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(admin, stripe, event.data.object as Stripe.Checkout.Session);
      return;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await syncBySubscription(admin, event.data.object as Stripe.Subscription);
      return;
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const patch = patchFromSubscription(subscription);
      patch.subscription_status = STATUS_EXPIRED;
      patch.subscription_ends_at = unixToIso(
        subscription.ended_at ??
          subscription.canceled_at ??
          subscriptionPeriodEnd(subscription) ??
          subscription.trial_end
      );

      const user = await resolveUser(admin, {
        userId: metadataUserId(subscription.metadata),
        subscriptionId: subscription.id,
        customerId: extractId(subscription.customer)
      });
      if (!user) {
        return;
      }
      await updateUser(admin, user.id, patch);
      return;
    }
    case "invoice.paid":
      await handleInvoicePaid(admin, stripe, event.data.object as Stripe.Invoice);
      return;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(admin, stripe, event.data.object as Stripe.Invoice);
      return;
    default:
      return;
  }
}

export async function POST(request: Request) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecretKey || !stripeWebhookSecret) {
    return NextResponse.json(
      { error: "missing_stripe_env" },
      { status: 500 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing_stripe_signature" }, { status: 400 });
  }

  const stripe = new Stripe(stripeSecretKey);
  const body = await request.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, stripeWebhookSecret);
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "invalid_stripe_signature",
        details: error?.message ?? "Unknown signature validation error"
      },
      { status: 400 }
    );
  }

  try {
    const admin = createAdminClient();
    await processEvent(admin, stripe, event);
  } catch (error: any) {
    console.error("stripe_webhook_processing_failed", {
      eventType: event.type,
      error: error?.message ?? "unknown_error"
    });
    return NextResponse.json({ error: "stripe_webhook_processing_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
