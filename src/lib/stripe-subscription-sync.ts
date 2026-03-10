import Stripe from "stripe";
import { Database } from "./database.types";
import { buildStripeLineItemsForPropertyCount, getStripePriceConfig } from "./stripe-pricing";

const SYNCABLE_SUBSCRIPTION_STATUSES = new Set(["active", "trial", "past_due"]);
const BILLING_OVERRIDE_FRIEND_FREE = "friend_free";

type BillingUserRow = Pick<
  Database["public"]["Tables"]["users"]["Row"],
  "id" | "email" | "subscription_status" | "billing_override" | "stripe_subscription_id"
>;

type StripeSubscriptionSyncSkipReason =
  | "stripe_not_configured"
  | "price_config_missing"
  | "user_not_found"
  | "gift_override"
  | "subscription_inactive"
  | "subscription_missing"
  | "price_extra_missing"
  | "sync_failed";

type StripeSubscriptionSyncOptions = {
  userId: string;
  propertyCount?: number | null;
  email?: string | null;
  context?: string;
};

export type StripeSubscriptionSyncResult =
  | {
      outcome: "updated" | "noop";
      propertyCount: number;
      subscriptionId: string;
    }
  | {
      outcome: "skipped";
      reason: StripeSubscriptionSyncSkipReason;
    };

function asNonEmptyString(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  return normalized.length ? normalized : null;
}

function normalizedLower(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

async function loadBillingUser(client: any, userId: string) {
  const { data, error } = await client
    .from("users")
    .select("id, email, subscription_status, billing_override, stripe_subscription_id")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`stripe_sync_user_lookup_failed:${error.message}`);
  }

  return (data as BillingUserRow | null) ?? null;
}

async function countUserProperties(client: any, userId: string) {
  const { count, error } = await client
    .from("properties")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", userId);

  if (error) {
    throw new Error(`stripe_sync_property_count_failed:${error.message}`);
  }

  return count ?? 0;
}

function getSubscriptionItemPriceId(item: Stripe.SubscriptionItem) {
  if (typeof item.price === "string") {
    return asNonEmptyString(item.price);
  }
  return asNonEmptyString(item.price?.id ?? null);
}

export async function syncStripeSubscriptionForUser(
  client: any,
  { userId, propertyCount }: StripeSubscriptionSyncOptions
): Promise<StripeSubscriptionSyncResult> {
  const stripeSecretKey = asNonEmptyString(process.env.STRIPE_SECRET_KEY);
  if (!stripeSecretKey) {
    return { outcome: "skipped", reason: "stripe_not_configured" };
  }

  const priceConfig = getStripePriceConfig();
  if (!priceConfig) {
    return { outcome: "skipped", reason: "price_config_missing" };
  }

  const billingUser = await loadBillingUser(client, userId);
  if (!billingUser) {
    return { outcome: "skipped", reason: "user_not_found" };
  }

  if (normalizedLower(billingUser.billing_override) === BILLING_OVERRIDE_FRIEND_FREE) {
    return { outcome: "skipped", reason: "gift_override" };
  }

  if (!SYNCABLE_SUBSCRIPTION_STATUSES.has(normalizedLower(billingUser.subscription_status))) {
    return { outcome: "skipped", reason: "subscription_inactive" };
  }

  const subscriptionId = asNonEmptyString(billingUser.stripe_subscription_id);
  if (!subscriptionId) {
    return { outcome: "skipped", reason: "subscription_missing" };
  }

  const resolvedPropertyCountRaw =
    typeof propertyCount === "number" && Number.isFinite(propertyCount)
      ? propertyCount
      : await countUserProperties(client, userId);
  const resolvedPropertyCount = Math.max(Math.floor(resolvedPropertyCountRaw), 0);

  let desiredLineItems: Array<{ price: string; quantity: number }>;
  try {
    desiredLineItems = buildStripeLineItemsForPropertyCount(resolvedPropertyCount, priceConfig);
  } catch {
    return { outcome: "skipped", reason: "price_extra_missing" };
  }

  const stripe = new Stripe(stripeSecretKey);
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price"]
  });

  const managedPriceIds = new Set(
    [priceConfig.basic1to5, priceConfig.basic6to10, priceConfig.extra].filter(
      (value): value is string => Boolean(value)
    )
  );
  const managedItemsByPrice = new Map<string, Stripe.SubscriptionItem[]>();

  for (const item of subscription.items.data) {
    const priceId = getSubscriptionItemPriceId(item);
    if (!priceId || !managedPriceIds.has(priceId)) continue;
    const existing = managedItemsByPrice.get(priceId) ?? [];
    existing.push(item);
    managedItemsByPrice.set(priceId, existing);
  }

  const updates: Stripe.SubscriptionUpdateParams.Item[] = [];
  let hasChanges = false;

  for (const lineItem of desiredLineItems) {
    const existingItems = managedItemsByPrice.get(lineItem.price) ?? [];
    if (!existingItems.length) {
      hasChanges = true;
      updates.push({ price: lineItem.price, quantity: lineItem.quantity });
      continue;
    }

    const [primary, ...duplicates] = existingItems;
    const currentQuantity = primary.quantity ?? 1;
    if (currentQuantity !== lineItem.quantity) {
      hasChanges = true;
    }
    updates.push({ id: primary.id, quantity: lineItem.quantity });

    for (const duplicate of duplicates) {
      hasChanges = true;
      updates.push({ id: duplicate.id, deleted: true });
    }

    managedItemsByPrice.delete(lineItem.price);
  }

  for (const danglingItems of managedItemsByPrice.values()) {
    for (const danglingItem of danglingItems) {
      hasChanges = true;
      updates.push({ id: danglingItem.id, deleted: true });
    }
  }

  if (!hasChanges) {
    return {
      outcome: "noop",
      propertyCount: resolvedPropertyCount,
      subscriptionId
    };
  }

  await stripe.subscriptions.update(subscription.id, {
    items: updates,
    proration_behavior: "create_prorations",
    metadata: {
      ...subscription.metadata,
      user_id: userId,
      property_count: String(resolvedPropertyCount)
    }
  });

  return {
    outcome: "updated",
    propertyCount: resolvedPropertyCount,
    subscriptionId
  };
}

export async function syncStripeSubscriptionForUserSafely(
  client: any,
  options: StripeSubscriptionSyncOptions
) {
  try {
    return await syncStripeSubscriptionForUser(client, options);
  } catch (error) {
    console.error("stripe_subscription_sync_failed", {
      userId: options.userId,
      context: options.context ?? null,
      error: error instanceof Error ? error.message : "unknown_error"
    });
    return {
      outcome: "skipped" as const,
      reason: "sync_failed" as const
    };
  }
}
