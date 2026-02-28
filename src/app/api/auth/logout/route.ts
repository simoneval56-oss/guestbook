import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase/server";

function resolveBaseUrl(request: Request) {
  const configured = process.env.NEXT_PUBLIC_BASE_URL;
  if (configured) return configured;
  try {
    return new URL(request.url).origin;
  } catch {
    return "http://localhost:3000";
  }
}

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  await supabase.auth.signOut();
  const response = NextResponse.redirect(new URL("/", resolveBaseUrl(request)), { status: 303 });
  return response;
}

export async function GET(request: Request) {
  return NextResponse.redirect(new URL("/", resolveBaseUrl(request)), { status: 307 });
}
