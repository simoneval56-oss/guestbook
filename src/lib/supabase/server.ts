import { cookies, headers } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { Database } from "../database.types";

type ServerSupabaseOptions = {
  extraHeaders?: HeadersInit;
};

export function createServerSupabaseClient(options: ServerSupabaseOptions = {}) {
  const getAll = async () => {
    const cookieStore = await cookies();
    return cookieStore.getAll().map((cookie: { name: string; value: string }) => ({
      name: cookie.name,
      value: cookie.value
    }));
  };
  const setAll = async (cookiesToSet: { name: string; value: string; options: CookieOptions }[]) => {
    const cookieStore = await cookies();
    cookiesToSet.forEach(({ name, value, options }) => {
      try {
        cookieStore.set({
          name,
          value,
          path: "/",
          ...options
        });
      } catch {
        // In server components cookies are read-only; ignore to avoid runtime errors.
      }
    });
  };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing Supabase public env vars");
  }

  const globalHeaders: Record<string, string> = {};
  if (options.extraHeaders) {
    const extras = new Headers(options.extraHeaders);
    extras.forEach((value, key) => {
      globalHeaders[key] = value;
    });
  }

  return createServerClient<Database>(
    url,
    anonKey,
    {
      cookieOptions: {
        path: "/"
      },
      cookies: {
        getAll,
        setAll
      },
      global: Object.keys(globalHeaders).length ? { headers: globalHeaders } : undefined
    } as any
  );
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase service role env vars");
  }
  return createServerClient<Database>(
    url,
    serviceRoleKey,
    {
      cookies: {
        get() {
          return "";
        },
        set() {},
        remove() {}
      },
      headers
    } as any
  );
}
