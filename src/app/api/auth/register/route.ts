import { NextResponse } from "next/server";
import {
  LEGAL_TRIAL_DAYS,
  buildLegalAcceptanceFields
} from "../../../../lib/legal";
import { createAdminClient, createServerSupabaseClient } from "../../../../lib/supabase/server";

type RegisterRequestBody = {
  email?: string;
  password?: string;
  redirectTo?: string;
  acceptLegal?: boolean;
};

function resolveBaseUrl(request: Request) {
  const configured = process.env.NEXT_PUBLIC_BASE_URL;
  if (configured && configured.trim()) return configured.trim().replace(/\/+$/, "");
  try {
    return new URL(request.url).origin;
  } catch {
    return "http://localhost:3000";
  }
}

function sanitizeRedirectPath(value: string | undefined) {
  if (!value) return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

function buildTrialEndsAt(now = new Date()) {
  return new Date(now.getTime() + LEGAL_TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function isSignupRateLimited(rawMessage: string | undefined) {
  return /rate limit/i.test(rawMessage ?? "");
}

export async function POST(request: Request) {
  let body: RegisterRequestBody | null = null;

  try {
    body = (await request.json()) as RegisterRequestBody;
  } catch {
    return NextResponse.json({ error: "invalid_request_body" }, { status: 400 });
  }

  const email = (body?.email ?? "").trim();
  const password = body?.password ?? "";
  const redirectTo = sanitizeRedirectPath(body?.redirectTo);

  if (!email || !password) {
    return NextResponse.json({ error: "missing_credentials" }, { status: 400 });
  }

  if (body?.acceptLegal !== true) {
    return NextResponse.json({ error: "legal_acceptance_required" }, { status: 400 });
  }

  const baseUrl = resolveBaseUrl(request);
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${baseUrl}${redirectTo}`,
      data: buildLegalAcceptanceFields()
    }
  });

  if (error) {
    if (isSignupRateLimited(error.message)) {
      return NextResponse.json({ error: "signup_rate_limited" }, { status: 429 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!data.user) {
    return NextResponse.json({ error: "signup_failed" }, { status: 500 });
  }

  const acceptedAt = new Date().toISOString();
  const admin = createAdminClient() as any;
  const { error: profileError } = await admin.from("users").upsert({
    id: data.user.id,
    email,
    subscription_status: "trial",
    plan_type: "starter",
    trial_ends_at: buildTrialEndsAt(),
    ...buildLegalAcceptanceFields({ acceptedAt })
  });

  if (profileError) {
    try {
      await admin.auth.admin.deleteUser(data.user.id);
    } catch {
      // Best effort cleanup if the profile row cannot be persisted.
    }

    return NextResponse.json({ error: "profile_setup_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    redirectTo,
    needsEmailConfirmation: !data.session
  });
}
