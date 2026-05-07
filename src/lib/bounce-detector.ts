import { google } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken, refreshAccessToken } from "@/lib/gmail";

// Gmail search filter for bounce / DSN messages. Covers Google, Microsoft
// Office 365, and most SMTP-RFC-3464 bounce flavours we've seen in the wild.
const BOUNCE_QUERY =
  "(from:mailer-daemon OR from:postmaster OR subject:(undeliverable OR undelivered OR \"address not found\" OR \"delivery status\" OR \"failure notice\" OR \"returned mail\")) newer_than:7d in:inbox";

const MAX_BOUNCES_PER_RUN = 50;
const BOUNCE_LOOKBACK_DAYS = 7;

type EmailAccountRow = {
  id: string;
  user_id: string;
  email: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_expires_at: string;
};

export type BouncePollResult = {
  account_email: string;
  scanned: number;
  bounces_recorded: number;
  errors: string[];
};

async function getFreshToken(
  admin: SupabaseClient,
  account: EmailAccountRow,
): Promise<string> {
  const expiresAt = new Date(account.token_expires_at);
  const now = new Date();
  if (expiresAt.getTime() - now.getTime() > 60_000) {
    return decryptToken(account.access_token_encrypted);
  }
  const refreshed = await refreshAccessToken(account.refresh_token_encrypted);
  await admin
    .from("email_accounts")
    .update({
      access_token_encrypted: encryptToken(refreshed.access_token),
      token_expires_at: refreshed.expires_at.toISOString(),
    })
    .eq("id", account.id);
  return refreshed.access_token;
}

function decodeBase64Url(s: string): string {
  const normalized = s.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Buffer.from(normalized, "base64").toString("utf8");
  } catch {
    return "";
  }
}

// Walk Gmail's nested payload tree and collect text/plain + text/html body
// data, base64-decoded. Handles common multipart shapes.
function extractMessageText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as {
    mimeType?: string;
    body?: { data?: string };
    parts?: unknown[];
  };
  let out = "";
  if (p.body?.data) {
    out += decodeBase64Url(p.body.data) + "\n";
  }
  if (Array.isArray(p.parts)) {
    for (const part of p.parts) {
      out += extractMessageText(part);
    }
  }
  return out;
}

// Extract email addresses from a bounce body. Looks for the common DSN
// patterns first, then falls back to any recognisable address.
const EMAIL_RX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function extractBouncedEmails(body: string, accountEmail: string): string[] {
  const seen = new Set<string>();
  const lower = accountEmail.toLowerCase();

  // Prefer the "Final-Recipient: rfc822; foo@bar" line if present
  const finalRcpt = body.match(
    /Final-Recipient:\s*(?:rfc822;)?\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i,
  );
  if (finalRcpt) {
    const addr = finalRcpt[1].toLowerCase();
    if (addr !== lower) seen.add(addr);
  }

  // Pull all emails and dedupe against our own
  const all = body.match(EMAIL_RX) ?? [];
  for (const raw of all) {
    const addr = raw.toLowerCase();
    if (addr === lower) continue;
    // Skip bounce sender addresses
    if (addr.startsWith("mailer-daemon@")) continue;
    if (addr.startsWith("postmaster@")) continue;
    seen.add(addr);
  }
  return Array.from(seen);
}

/**
 * Poll Gmail inbox for bounce / DSN messages and mark matching
 * campaign_recipients as bounced. Also flips contacts.status to 'bounced'
 * so future queues skip them outright.
 */
export async function pollBouncesForAccount(
  admin: SupabaseClient,
  account: EmailAccountRow,
): Promise<BouncePollResult> {
  const result: BouncePollResult = {
    account_email: account.email,
    scanned: 0,
    bounces_recorded: 0,
    errors: [],
  };

  let accessToken: string;
  try {
    accessToken = await getFreshToken(admin, account);
  } catch (err) {
    result.errors.push(
      `Token refresh: ${err instanceof Error ? err.message : "unknown"}`,
    );
    return result;
  }

  const oauth = new google.auth.OAuth2();
  oauth.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth: oauth });

  let messageList;
  try {
    messageList = await gmail.users.messages.list({
      userId: "me",
      q: BOUNCE_QUERY,
      maxResults: MAX_BOUNCES_PER_RUN,
    });
  } catch (err) {
    result.errors.push(
      `messages.list: ${err instanceof Error ? err.message : "unknown"}`,
    );
    return result;
  }

  const messages = messageList.data.messages ?? [];
  if (messages.length === 0) return result;

  const cutoffIso = new Date(
    Date.now() - BOUNCE_LOOKBACK_DAYS * 24 * 3600 * 1000,
  ).toISOString();

  for (const m of messages) {
    if (!m.id) continue;
    result.scanned++;

    let full;
    try {
      full = await gmail.users.messages.get({
        userId: "me",
        id: m.id,
        format: "full",
      });
    } catch (err) {
      result.errors.push(
        `messages.get ${m.id}: ${err instanceof Error ? err.message : "unknown"}`,
      );
      continue;
    }

    const body = extractMessageText(full.data.payload);
    if (!body) continue;

    const bouncedEmails = extractBouncedEmails(body, account.email);
    if (bouncedEmails.length === 0) continue;

    // Find recent campaign_recipients matching any of the bounced emails
    const { data: hits } = await admin
      .from("campaign_recipients")
      .select("id, contact_id, contact_email, workspace_id, status")
      .eq("user_id", account.user_id)
      .gte("created_at", cutoffIso)
      .in(
        "contact_email",
        bouncedEmails.map((e) => e.toLowerCase()),
      )
      .in("status", ["sending", "sent", "opened"]);

    if (!hits || hits.length === 0) continue;

    const nowIso = new Date().toISOString();
    const errorSnippet = body.slice(0, 500).replace(/\s+/g, " ").trim();

    for (const hit of hits) {
      const row = hit as {
        id: string;
        contact_id: string;
        contact_email: string;
        workspace_id: string;
        status: string;
      };

      await Promise.all([
        admin
          .from("campaign_recipients")
          .update({
            status: "bounced",
            bounced_at: nowIso,
            error_message: errorSnippet,
          })
          .eq("id", row.id),
        // Flip the global contact to 'bounced' so other workspaces stop
        // attempting too.
        admin
          .from("contacts")
          .update({ status: "bounced" })
          .eq("id", row.contact_id),
        // Mirror to queue_recipients linked to this campaign_recipient
        admin
          .from("queue_recipients")
          .update({ status: "bounced" })
          .eq("campaign_recipient_id", row.id),
        admin.from("activity_log").insert({
          user_id: account.user_id,
          workspace_id: row.workspace_id,
          activity_type: "email_bounced",
          entity_type: "campaign_recipient",
          entity_id: row.id,
          metadata: {
            contact_email: row.contact_email,
            bounce_snippet: errorSnippet.slice(0, 240),
          },
        }),
      ]);

      result.bounces_recorded++;
    }
  }

  return result;
}
