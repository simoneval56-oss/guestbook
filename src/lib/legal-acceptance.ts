import { Database } from "./database.types";
import { LEGAL_PRIVACY_VERSION, LEGAL_TERMS_VERSION, buildLegalAcceptanceFields } from "./legal";

type UserLegalAcceptanceRow = Pick<
  Database["public"]["Tables"]["users"]["Row"],
  "id" | "email" | "terms_version" | "privacy_version" | "terms_accepted_at" | "privacy_accepted_at"
>;

export type LegalAcceptanceReason = "missing" | "outdated";

export type LegalAcceptanceState = {
  reason: LegalAcceptanceReason | null;
  requiresAcceptance: boolean;
  termsVersion: string | null;
  privacyVersion: string | null;
  termsAcceptedAt: string | null;
  privacyAcceptedAt: string | null;
};

function resolveLegalAcceptanceState(row: UserLegalAcceptanceRow | null): LegalAcceptanceState {
  if (!row) {
    return {
      reason: "missing",
      requiresAcceptance: true,
      termsVersion: null,
      privacyVersion: null,
      termsAcceptedAt: null,
      privacyAcceptedAt: null
    };
  }

  const termsVersion = row.terms_version ?? null;
  const privacyVersion = row.privacy_version ?? null;
  const termsAcceptedAt = row.terms_accepted_at ?? null;
  const privacyAcceptedAt = row.privacy_accepted_at ?? null;
  const hasStoredAcceptance = Boolean(termsVersion && privacyVersion && termsAcceptedAt && privacyAcceptedAt);

  if (!hasStoredAcceptance) {
    return {
      reason: "missing",
      requiresAcceptance: true,
      termsVersion,
      privacyVersion,
      termsAcceptedAt,
      privacyAcceptedAt
    };
  }

  const isCurrent = termsVersion === LEGAL_TERMS_VERSION && privacyVersion === LEGAL_PRIVACY_VERSION;

  return {
    reason: isCurrent ? null : "outdated",
    requiresAcceptance: !isCurrent,
    termsVersion,
    privacyVersion,
    termsAcceptedAt,
    privacyAcceptedAt
  };
}

export async function getLegalAcceptanceState(client: any, userId: string): Promise<LegalAcceptanceState> {
  const { data, error } = await client
    .from("users")
    .select("id, email, terms_version, privacy_version, terms_accepted_at, privacy_accepted_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return resolveLegalAcceptanceState((data as UserLegalAcceptanceRow | null) ?? null);
}

export async function requireCurrentLegalAcceptance(client: any, userId: string) {
  const state = await getLegalAcceptanceState(client, userId);
  if (!state.requiresAcceptance) {
    return state;
  }

  const error = new Error("legal_acceptance_required") as Error & { reason?: LegalAcceptanceReason };
  error.reason = state.reason ?? "missing";
  throw error;
}

type AcceptCurrentLegalDocumentsInput = {
  userId: string;
  email: string | null;
  source?: string;
};

export async function acceptCurrentLegalDocuments(client: any, input: AcceptCurrentLegalDocumentsInput) {
  const acceptedAt = new Date().toISOString();
  const legalFields = buildLegalAcceptanceFields({
    acceptedAt,
    source: input.source
  });

  const { data: existingUser, error: existingUserError } = await client
    .from("users")
    .select("id")
    .eq("id", input.userId)
    .maybeSingle();

  if (existingUserError) {
    throw existingUserError;
  }

  if (existingUser) {
    const { error: updateError } = await client.from("users").update(legalFields).eq("id", input.userId);
    if (updateError) {
      throw updateError;
    }

    return {
      acceptedAt,
      ...legalFields
    };
  }

  if (!input.email) {
    throw new Error("profile_not_found");
  }

  const payload: Database["public"]["Tables"]["users"]["Insert"] = {
    id: input.userId,
    email: input.email,
    ...legalFields
  };
  const { error: insertError } = await client.from("users").upsert(payload);
  if (insertError) {
    throw insertError;
  }

  return {
    acceptedAt,
    ...legalFields
  };
}
