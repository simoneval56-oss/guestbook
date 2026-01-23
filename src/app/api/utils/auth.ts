import { headers } from "next/headers";
import { createAdminClient } from "../../../lib/supabase/server";

export async function requireUser() {
  const admin = createAdminClient();
  const authHeader = headers().get("authorization");
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
