import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens, encryptToken } from "@/lib/gmail";

type StatePayload = {
  nonce: string;
  slug: string;
  workspace_id: string;
};

function parseState(stateB64: string | null): StatePayload | null {
  if (!stateB64) return null;
  try {
    const json = Buffer.from(stateB64, "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    if (
      typeof parsed.nonce === "string" &&
      typeof parsed.slug === "string" &&
      typeof parsed.workspace_id === "string"
    ) {
      return parsed as StatePayload;
    }
    return null;
  } catch {
    return null;
  }
}

function redirectToSettings(
  request: NextRequest,
  slug: string | null,
  params: Record<string, string>,
): NextResponse {
  const url = new URL(slug ? `/w/${slug}/settings` : "/dashboard", request.url);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const stateB64 = searchParams.get("state");
  const oauthError = searchParams.get("error");

  const state = parseState(stateB64);

  if (oauthError) {
    return redirectToSettings(request, state?.slug ?? null, {
      gmail_error: searchParams.get("error_description") ?? oauthError,
    });
  }

  if (!code || !state) {
    return redirectToSettings(request, state?.slug ?? null, {
      gmail_error: "Missing OAuth code or state",
    });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Exchange code for tokens + user info
  let exchanged;
  try {
    exchanged = await exchangeCodeForTokens(code);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Token exchange failed";
    return redirectToSettings(request, state.slug, { gmail_error: msg });
  }

  // Check if THIS Gmail account is already connected to a DIFFERENT workspace
  const { data: existingByEmail } = await supabase
    .from("email_accounts")
    .select("id, workspace_id")
    .eq("user_id", user.id)
    .eq("email", exchanged.email)
    .maybeSingle();

  if (existingByEmail && existingByEmail.workspace_id && existingByEmail.workspace_id !== state.workspace_id) {
    return redirectToSettings(request, state.slug, {
      gmail_error: `Email ${exchanged.email} sudah terhubung ke workspace lain. Disconnect dulu di sana.`,
    });
  }

  // Check if THIS workspace already has a different Gmail
  const { data: existingByWorkspace } = await supabase
    .from("email_accounts")
    .select("id, email")
    .eq("user_id", user.id)
    .eq("workspace_id", state.workspace_id)
    .maybeSingle();

  if (existingByWorkspace && existingByWorkspace.email !== exchanged.email) {
    return redirectToSettings(request, state.slug, {
      gmail_error: `Workspace ini sudah punya Gmail ${existingByWorkspace.email}. Disconnect dulu sebelum connect yang baru.`,
    });
  }

  const accessTokenEncrypted = encryptToken(exchanged.access_token);
  const refreshTokenEncrypted = encryptToken(exchanged.refresh_token);

  // Compute warmup mode: assume the account is "fresh" if first connect,
  // user can override later in settings.
  const warmupMode = false; // default off; user explicitly enables for new accounts

  if (existingByEmail) {
    // Re-connect: update tokens
    await supabase
      .from("email_accounts")
      .update({
        workspace_id: state.workspace_id,
        access_token_encrypted: accessTokenEncrypted,
        refresh_token_encrypted: refreshTokenEncrypted,
        token_expires_at: exchanged.expires_at.toISOString(),
        oauth_scope: exchanged.granted_scope,
        is_active: true,
        health_status: "healthy",
        health_notes: null,
        display_name: exchanged.name,
      })
      .eq("id", existingByEmail.id);
  } else {
    // First time connect for this email
    await supabase.from("email_accounts").insert({
      user_id: user.id,
      workspace_id: state.workspace_id,
      email: exchanged.email,
      display_name: exchanged.name,
      access_token_encrypted: accessTokenEncrypted,
      refresh_token_encrypted: refreshTokenEncrypted,
      token_expires_at: exchanged.expires_at.toISOString(),
      oauth_scope: exchanged.granted_scope,
      is_active: true,
      daily_quota: 30,
      health_status: "healthy",
      warmup_mode: warmupMode,
    });
  }

  return redirectToSettings(request, state.slug, {
    gmail_success: exchanged.email,
  });
}
