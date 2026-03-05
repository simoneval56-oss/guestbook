import { Database } from "./database.types";

const STATUS_TRIAL = "trial";
const STATUS_ACTIVE = "active";
const STATUS_EXPIRED = "expired";
const DEFAULT_PLAN = "starter";
const ACTIVE_SERVICE_STATUSES = new Set([STATUS_TRIAL, STATUS_ACTIVE]);
const BILLING_OVERRIDE_FRIEND_FREE = "friend_free";

export const TRIAL_DURATION_DAYS = 7;

type UsersRow = Database["public"]["Tables"]["users"]["Row"];
type UsersUpdate = Database["public"]["Tables"]["users"]["Update"];
type UsersInsert = Database["public"]["Tables"]["users"]["Insert"];

type EnsureUserBillingOptions = {
  userId: string;
  email?: string | null;
  now?: Date;
  syncPlan?: boolean;
};

export type UserBillingState = {
  status: string;
  planType: string;
  propertyCount: number | null;
  trialEndsAt: string | null;
  subscriptionEndsAt: string | null;
  billingOverride: string | null;
  serviceActive: boolean;
  inactiveReason: "trial_expired" | "subscription_expired" | "inactive_status" | null;
};

function normalizeStatus(raw: string | null | undefined) {
  const value = (raw ?? "").trim().toLowerCase();
  return value || STATUS_TRIAL;
}

function normalizeBillingOverride(raw: string | null | undefined) {
  const value = (raw ?? "").trim().toLowerCase();
  return value === BILLING_OVERRIDE_FRIEND_FREE ? value : null;
}

function isPast(isoValue: string | null | undefined, now: Date) {
  if (!isoValue) return false;
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() < now.getTime();
}

function addDays(base: Date, days: number) {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

function buildTrialEndsAt(now: Date) {
  return addDays(now, TRIAL_DURATION_DAYS).toISOString();
}

function buildTrialEndsAtFromCreatedAt(createdAt: string | null | undefined, now: Date) {
  if (!createdAt) return buildTrialEndsAt(now);
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) return buildTrialEndsAt(now);
  return addDays(parsed, TRIAL_DURATION_DAYS).toISOString();
}

export function resolvePlanTypeByPropertyCount(propertyCount: number) {
  if (propertyCount <= 0) return DEFAULT_PLAN;
  if (propertyCount <= 5) return "basic_1_5";
  if (propertyCount <= 10) return "basic_6_10";
  return "basic_11_plus";
}

async function readUserRow(client: any, userId: string): Promise<UsersRow | null> {
  const withOverride = await client
    .from("users")
    .select("id, email, subscription_status, plan_type, trial_ends_at, subscription_ends_at, billing_override, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (!withOverride.error) {
    return (withOverride.data as UsersRow | null) ?? null;
  }

  const missingOverrideColumn = /billing_override/i.test(withOverride.error.message ?? "");
  if (!missingOverrideColumn) {
    throw new Error(`billing_user_lookup_failed:${withOverride.error.message}`);
  }

  // Backward compatibility: environments not yet migrated can still read user billing state.
  const fallback = await client
    .from("users")
    .select("id, email, subscription_status, plan_type, trial_ends_at, subscription_ends_at, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (fallback.error) {
    throw new Error(`billing_user_lookup_failed:${fallback.error.message}`);
  }

  if (!fallback.data) return null;
  return { ...fallback.data, billing_override: null } as UsersRow;
}

async function countUserProperties(client: any, userId: string) {
  const { count, error } = await client
    .from("properties")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", userId);
  if (error) {
    throw new Error(`billing_property_count_failed:${error.message}`);
  }
  return count ?? 0;
}

async function ensureUserRowExists(client: any, userId: string, email: string | null | undefined, now: Date) {
  const payload: UsersInsert = {
    id: userId,
    email: email && email.trim() ? email : `${userId}@guesthomebook.local`,
    subscription_status: STATUS_TRIAL,
    plan_type: DEFAULT_PLAN,
    trial_ends_at: buildTrialEndsAt(now)
  };
  const { error } = await client.from("users").upsert(payload, { onConflict: "id" });
  if (error) {
    throw new Error(`billing_user_upsert_failed:${error.message}`);
  }
}

export async function ensureUserBillingState(
  client: any,
  { userId, email, now = new Date(), syncPlan = false }: EnsureUserBillingOptions
): Promise<UserBillingState> {
  let userRow = await readUserRow(client, userId);
  if (!userRow) {
    await ensureUserRowExists(client, userId, email, now);
    userRow = await readUserRow(client, userId);
  }

  if (!userRow) {
    throw new Error("billing_user_missing_after_upsert");
  }

  let status = normalizeStatus(userRow.subscription_status);
  const billingOverride = normalizeBillingOverride(userRow.billing_override);
  let trialEndsAt =
    userRow.trial_ends_at ??
    (status === STATUS_TRIAL ? buildTrialEndsAtFromCreatedAt(userRow.created_at, now) : null);
  const subscriptionEndsAt = userRow.subscription_ends_at ?? null;

  let inactiveReason: UserBillingState["inactiveReason"] = null;
  if (status === STATUS_TRIAL && isPast(trialEndsAt, now)) {
    status = STATUS_EXPIRED;
    inactiveReason = "trial_expired";
  } else if (status === STATUS_ACTIVE && isPast(subscriptionEndsAt, now)) {
    status = STATUS_EXPIRED;
    inactiveReason = "subscription_expired";
  } else if (!ACTIVE_SERVICE_STATUSES.has(status)) {
    inactiveReason = "inactive_status";
  }

  if (billingOverride === BILLING_OVERRIDE_FRIEND_FREE) {
    inactiveReason = null;
  }

  let propertyCount: number | null = null;
  let planType = userRow.plan_type ?? DEFAULT_PLAN;
  if (syncPlan) {
    const count = await countUserProperties(client, userId);
    propertyCount = count;
    planType = resolvePlanTypeByPropertyCount(count);
  }

  const patch: UsersUpdate = {};
  if (email && email.trim() && userRow.email !== email) {
    patch.email = email;
  }
  if (userRow.subscription_status !== status) {
    patch.subscription_status = status;
  }
  if (userRow.trial_ends_at !== trialEndsAt) {
    patch.trial_ends_at = trialEndsAt;
  }
  if (userRow.plan_type !== planType) {
    patch.plan_type = planType;
  }

  if (Object.keys(patch).length) {
    const { error } = await client.from("users").update(patch).eq("id", userId);
    if (error) {
      throw new Error(`billing_user_update_failed:${error.message}`);
    }
  }

  const serviceActive =
    billingOverride === BILLING_OVERRIDE_FRIEND_FREE ||
    (ACTIVE_SERVICE_STATUSES.has(status) && inactiveReason === null);

  return {
    status,
    planType,
    propertyCount,
    trialEndsAt,
    subscriptionEndsAt,
    billingOverride,
    serviceActive,
    inactiveReason
  };
}

export async function requireActiveUserService(
  client: any,
  options: EnsureUserBillingOptions
): Promise<UserBillingState> {
  const state = await ensureUserBillingState(client, { ...options, syncPlan: true });
  if (!state.serviceActive) {
    throw new Error("subscription_inactive");
  }
  return state;
}
