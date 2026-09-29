import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Supabase redirects here after the Google OAuth flow completes.
 * We exchange the `code` for a session, then redirect to the original
 * destination (or /dashboard by default).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Only allow same-origin relative paths — "https://evil.com" and
  // protocol-relative "//evil.com" would otherwise become open redirects.
  const rawRedirect = searchParams.get("redirect") ?? "";
  const redirectTo =
    rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
      ? rawRedirect
      : "/dashboard";
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (error) {
    const url = new URL("/login", origin);
    url.searchParams.set("error", errorDescription ?? error);
    return NextResponse.redirect(url);
  }

  if (!code) {
    const url = new URL("/login", origin);
    url.searchParams.set("error", "Missing OAuth code");
    return NextResponse.redirect(url);
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    const url = new URL("/login", origin);
    url.searchParams.set("error", exchangeError.message);
    return NextResponse.redirect(url);
  }

  return NextResponse.redirect(new URL(redirectTo, origin));
}
