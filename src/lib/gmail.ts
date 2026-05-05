import { google } from "googleapis";
import { encrypt, decrypt } from "@/lib/crypto";

export const GMAIL_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
] as const;

export const GMAIL_CONNECT_REDIRECT_PATH = "/auth/gmail-connect/callback";

function getRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}${GMAIL_CONNECT_REDIRECT_PATH}`;
}

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri(),
  );
}

/**
 * Build the Google OAuth consent URL with prompt=select_account so the user
 * can pick a different Gmail account than the one they used for app login.
 */
export function buildAuthUrl(state: string): string {
  const oauth = getOAuthClient();
  return oauth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent select_account",
    scope: [...GMAIL_SCOPES],
    state,
    include_granted_scopes: true,
  });
}

export type ExchangeResult = {
  email: string;
  name: string | null;
  picture: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: Date;
  granted_scope: string | null;
};

/**
 * Exchange the OAuth code for tokens + user info.
 */
export async function exchangeCodeForTokens(
  code: string,
): Promise<ExchangeResult> {
  const oauth = getOAuthClient();
  const { tokens } = await oauth.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error(
      "Missing access_token or refresh_token. Make sure the OAuth flow includes prompt=consent.",
    );
  }

  oauth.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: oauth });
  const { data } = await oauth2.userinfo.get();
  if (!data.email) {
    throw new Error("Could not fetch user email from Google");
  }

  const expiresAt = tokens.expiry_date
    ? new Date(tokens.expiry_date)
    : new Date(Date.now() + 3600 * 1000);

  return {
    email: data.email.toLowerCase(),
    name: data.name ?? null,
    picture: data.picture ?? null,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiresAt,
    granted_scope: tokens.scope ?? null,
  };
}

/**
 * Refresh an access token using a stored encrypted refresh token.
 * Returns new access token + expiry.
 */
export async function refreshAccessToken(
  refreshTokenEncrypted: string,
): Promise<{ access_token: string; expires_at: Date }> {
  const refreshToken = decrypt(refreshTokenEncrypted);
  const oauth = getOAuthClient();
  oauth.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth.refreshAccessToken();

  if (!credentials.access_token) {
    throw new Error("Failed to refresh access token");
  }

  const expiresAt = credentials.expiry_date
    ? new Date(credentials.expiry_date)
    : new Date(Date.now() + 3600 * 1000);

  return {
    access_token: credentials.access_token,
    expires_at: expiresAt,
  };
}

export { encrypt as encryptToken, decrypt as decryptToken };
