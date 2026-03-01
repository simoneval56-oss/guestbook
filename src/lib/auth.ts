import { createServerSupabaseClient } from "./supabase/server";

export async function getSessionUser() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();
  if (error) return null;
  return user ?? null;
}
