import { createServerSupabaseClient } from "./supabase/server";

export async function getSessionUser() {
  const supabase = createServerSupabaseClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();
  return session?.user ?? null;
}
