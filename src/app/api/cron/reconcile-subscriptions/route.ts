import { NextResponse } from "next/server";
import { Database } from "../../../../lib/database.types";
import { sendOpsAlert } from "../../../../lib/ops-alerts";
import { syncStripeSubscriptionForUserSafely } from "../../../../lib/stripe-subscription-sync";
import { createAdminClient } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYNCABLE_STATUSES = new Set(["active", "trial", "past_due"]);
const BILLING_OVERRIDE_FRIEND_FREE = "friend_free";
const PAGE_SIZE = 200;

type CandidateUser = Pick<
  Database["public"]["Tables"]["users"]["Row"],
  "id" | "email" | "subscription_status" | "billing_override" | "stripe_subscription_id"
>;

function asNonEmpty(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  return normalized.length ? normalized : null;
}

function parseBearerToken(request: Request) {
  const auth = asNonEmpty(request.headers.get("authorization"));
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function getExpectedSecret() {
  return asNonEmpty(process.env.RECONCILIATION_CRON_SECRET) ?? asNonEmpty(process.env.CRON_SECRET);
}

function normalizeStatus(status: string | null | undefined) {
  return (status ?? "").trim().toLowerCase();
}

async function listCandidateUsers(admin: any) {
  const users: CandidateUser[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await admin
      .from("users")
      .select("id, email, subscription_status, billing_override, stripe_subscription_id")
      .not("stripe_subscription_id", "is", null)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`reconciliation_user_query_failed:${error.message}`);
    }

    const batch = (data as CandidateUser[] | null) ?? [];
    if (!batch.length) break;
    users.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return users.filter((user) => {
    if (!asNonEmpty(user.stripe_subscription_id)) return false;
    if (normalizeStatus(user.billing_override) === BILLING_OVERRIDE_FRIEND_FREE) return false;
    return SYNCABLE_STATUSES.has(normalizeStatus(user.subscription_status));
  });
}

function incrementReason(reasons: Record<string, number>, reason: string) {
  reasons[reason] = (reasons[reason] ?? 0) + 1;
}

async function handleReconciliation(request: Request) {
  const expectedSecret = getExpectedSecret();
  if (!expectedSecret) {
    return NextResponse.json({ error: "missing_reconciliation_secret" }, { status: 500 });
  }

  const token = parseBearerToken(request);
  if (!token || token !== expectedSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const admin = createAdminClient() as any;

  try {
    const candidates = await listCandidateUsers(admin);
    const summary = {
      scanned: candidates.length,
      updated: 0,
      noop: 0,
      skipped: 0,
      reasons: {} as Record<string, number>
    };

    for (const user of candidates) {
      const result = await syncStripeSubscriptionForUserSafely(admin, {
        userId: user.id,
        email: user.email,
        context: "daily_reconciliation_job"
      });

      if (result.outcome === "skipped") {
        summary.skipped += 1;
        incrementReason(summary.reasons, result.reason);
      } else if (result.outcome === "updated") {
        summary.updated += 1;
      } else {
        summary.noop += 1;
      }
    }

    if ((summary.reasons.sync_failed ?? 0) > 0) {
      await sendOpsAlert({
        source: "reconciliation_job",
        severity: "warning",
        title: "Daily subscription reconciliation completed with failures",
        message: `${summary.reasons.sync_failed} sync operation(s) failed during reconciliation.`,
        details: summary
      });
    }

    return NextResponse.json({
      data: {
        ...summary,
        duration_ms: Date.now() - startedAt
      }
    });
  } catch (error: any) {
    const message = error?.message ?? "unknown_error";
    console.error("reconciliation_job_failed", { error: message });
    await sendOpsAlert({
      source: "reconciliation_job",
      severity: "critical",
      title: "Daily subscription reconciliation failed",
      message: "The reconciliation job crashed before completion.",
      details: {
        error: message
      }
    });
    return NextResponse.json({ error: "reconciliation_job_failed" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleReconciliation(request);
}

export async function POST(request: Request) {
  return handleReconciliation(request);
}
