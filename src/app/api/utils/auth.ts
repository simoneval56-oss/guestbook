import { headers } from "next/headers";
import { createAdminClient } from "../../../lib/supabase/server";
import { requireCurrentLegalAcceptance } from "../../../lib/legal-acceptance";
import { requireActiveUserService } from "../../../lib/subscription";

export async function requireUser() {
  const admin = createAdminClient();
  const authHeader = (await headers()).get("authorization");
  const token = authHeader?.replace("Bearer ", "") ?? "";
  if (!token) {
    throw new Error("unauthorized");
  }
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    throw new Error("unauthorized");
  }
  return data.user;
}

export async function requireAcceptedUser() {
  const user = await requireUser();
  const admin = createAdminClient();
  await requireCurrentLegalAcceptance(admin, user.id);
  return user;
}

export async function requireServiceUser() {
  const user = await requireAcceptedUser();
  const admin = createAdminClient();
  await requireActiveUserService(admin, {
    userId: user.id,
    email: user.email ?? null,
    syncPlan: true
  });
  return user;
}
