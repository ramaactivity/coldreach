import { google } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken, refreshAccessToken } from "@/lib/gmail";

// Gmail search filter for bounce / DSN messages. Covers Google, Microsoft
// Office 365, and most SMTP-RFC-3464 bounce flavours we've seen in the wild.
const BOUNCE_QUERY =
  "(from:mailer-daemon OR from:postmaster OR subject:(undeliverable OR undelivered OR \"address not found\" OR \"delivery status\" OR \"failure notice\" OR \"returned mail\" OR \"message blocked\" OR \"spam\")) newer_than:7d in:inbox";

const MAX_BOUNCES_PER_RUN = 50;
const BOUNCE_LOOKBACK_DAYS = 7;
// After this many soft bounces, treat the contact as effectively bounced.
const SOFT_BOUNCE_THRESHOLD = 3;
// If this many contacts at the same domain hard-bounce within the lookback,
// auto-archive every other contact at that domain too.
const DOMAIN_BLOCK_THRESHOLD = 3;

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
  hard: number;
  soft: number;
  blocked: number;
  spam: number;
  contacts_archived: number;
  domains_blocked: number;
  errors: string[];
};

type BounceType = "hard" | "soft" | "block" | "spam";

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

function extractHeaderValue(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined,
  name: string,
): string {
  if (!headers) return "";
  const lower = name.toLowerCase();
  const h = headers.find((x) => x.name?.toLowerCase() === lower);
  return h?.value ?? "";
}

const EMAIL_RX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function extractBouncedEmails(body: string, accountEmail: string): string[] {
  const seen = new Set<string>();
  const lower = accountEmail.toLowerCase();

  // Prefer the canonical RFC-3464 line if present
  const finalRcpt = body.match(
    /Final-Recipient:\s*(?:rfc822;)?\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i,
  );
  if (finalRcpt) {
    const addr = finalRcpt[1].toLowerCase();
    if (addr !== lower) seen.add(addr);
  }

  const all = body.match(EMAIL_RX) ?? [];
  for (const raw of all) {
    const addr = raw.toLowerCase();
    if (addr === lower) continue;
    if (addr.startsWith("mailer-daemon@")) continue;
    if (addr.startsWith("postmaster@")) continue;
    if (addr.startsWith("noreply@")) continue;
    if (addr.startsWith("no-reply@")) continue;
    seen.add(addr);
  }
  return Array.from(seen);
}

// Classify the bounce by scanning subject + body for known phrases.
// Order matters: more specific signals first.
function classifyBounce(subject: string, body: string): BounceType {
  const blob = `${subject}\n${body}`.toLowerCase();

  // Spam complaints
  if (
    /\b(spam complaint|abuse report|feedback loop|marked as spam|reported as spam)\b/.test(
      blob,
    )
  ) {
    return "spam";
  }

  // Active blocks (policy / sender reputation / blacklist)
  if (
    /\b(message blocked|blocked due to|policy violation|550[ -]5\.7|access denied|blacklisted|recipient rejected by .* policy)\b/.test(
      blob,
    )
  ) {
    return "block";
  }

  // Hard bounces — recipient definitely doesn't exist
  if (
    /\b(address not found|user unknown|no such user|recipient not found|does not exist|invalid recipient|no mailbox|address rejected|account that you tried to reach does not exist|550[ -]5\.1\.1)\b/.test(
      blob,
    )
  ) {
    return "hard";
  }

  // Soft / deferred: temporary problems
  if (
    /\b(mailbox full|over quota|temporarily (deferred|unavailable)|try again later|greylisted|451|452|421|4\.\d\.\d)\b/.test(
      blob,
    )
  ) {
    return "soft";
  }

  // Microsoft "Undeliverable" without specifics — usually hard
  if (/\bundeliverable\b/.test(blob)) return "hard";

  // Google "Address not found" subject
  if (/\baddress not found\b/.test(blob)) return "hard";

  // Default to hard so we err on the side of suppressing
  return "hard";
}

function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}

// Mark all pending queue_recipients pointing at a contact as 'skipped'.
// Saves the cron from waking up to discover the contact is bounced.
async function cleanupPendingQueueRecipients(
  admin: SupabaseClient,
  contactIds: string[],
): Promise<void> {
  if (contactIds.length === 0) return;
  await admin
    .from("queue_recipients")
    .update({ status: "skipped" })
    .in("contact_id", contactIds)
    .eq("status", "pending");
}

// If the same domain produced >= DOMAIN_BLOCK_THRESHOLD hard bounces in the
// lookback window, archive every other contact at that domain too. Catches
// company-wide blocks and dead domains before we waste more quota.
async function maybeBlockDomain(
  admin: SupabaseClient,
  userId: string,
  domain: string,
): Promise<{ archived: number; blocked: boolean }> {
  if (!domain) return { archived: 0, blocked: false };

  const cutoff = new Date(
    Date.now() - BOUNCE_LOOKBACK_DAYS * 24 * 3600 * 1000,
  ).toISOString();

  const { count } = await admin
    .from("campaign_recipients")
    .select("contact_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("bounce_type", "hard")
    .gte("bounced_at", cutoff)
    .ilike("contact_email", `%@${domain}`);

  if ((count ?? 0) < DOMAIN_BLOCK_THRESHOLD) {
    return { archived: 0, blocked: false };
  }

  // Archive every still-active contact at the domain. Using ilike on email
  // to catch all case variants.
  const nowIso = new Date().toISOString();
  const { data: archived } = await admin
    .from("contacts")
    .update({
      status: "blocked",
      archived_at: nowIso,
      archive_reason: "domain_blocked",
    })
    .eq("user_id", userId)
    .ilike("email", `%@${domain}`)
    .is("archived_at", null)
    .select("id");

  return {
    archived: archived?.length ?? 0,
    blocked: true,
  };
}

/**
 * Scan the inbox for delivery-failure / DSN messages and:
 *  - classify each bounce (hard / soft / block / spam)
 *  - update campaign_recipients with status + bounce_type
 *  - bump contacts.bounce_count, archive on hard / repeat-soft / spam
 *  - cleanup pending queue_recipients for archived contacts
 *  - if a domain hits the block threshold, archive every contact at that domain
 */
export async function pollBouncesForAccount(
  admin: SupabaseClient,
  account: EmailAccountRow,
): Promise<BouncePollResult> {
  const result: BouncePollResult = {
    account_email: account.email,
    scanned: 0,
    bounces_recorded: 0,
    hard: 0,
    soft: 0,
    blocked: 0,
    spam: 0,
    contacts_archived: 0,
    domains_blocked: 0,
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

  // Domains that just produced a fresh hard bounce — re-evaluate them at
  // the end so we don't repeatedly hit the same domain block check.
  const domainsToReevaluate = new Set<string>();
  // Contact ids freshly archived this run — used for queue cleanup batch.
  const archivedContactIds = new Set<string>();

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

    const subject = extractHeaderValue(
      full.data.payload?.headers ?? undefined,
      "Subject",
    );
    const body = extractMessageText(full.data.payload);
    if (!body) continue;

    const bounceType = classifyBounce(subject, body);
    const bouncedEmails = extractBouncedEmails(body, account.email);
    if (bouncedEmails.length === 0) continue;

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

      // Update campaign_recipients with bounce_type
      await admin
        .from("campaign_recipients")
        .update({
          status: "bounced",
          bounced_at: nowIso,
          bounce_type: bounceType,
          error_message: errorSnippet,
        })
        .eq("id", row.id);

      // Update contact: increment counters, decide archive/status
      const { data: contactRow } = await admin
        .from("contacts")
        .select("bounce_count, archived_at, status")
        .eq("id", row.contact_id)
        .maybeSingle();

      const currentCount =
        (contactRow as { bounce_count?: number } | null)?.bounce_count ?? 0;
      const alreadyArchived = !!(
        contactRow as { archived_at?: string | null } | null
      )?.archived_at;
      const newCount = currentCount + 1;

      // Decide whether this bounce justifies an immediate archive
      let nextStatus: string | null = null;
      let archiveReason: string | null = null;
      if (bounceType === "hard") {
        nextStatus = "bounced";
        archiveReason = "hard_bounce";
      } else if (bounceType === "block") {
        nextStatus = "blocked";
        archiveReason = "domain_blocked";
      } else if (bounceType === "spam") {
        nextStatus = "blocked";
        archiveReason = "spam_complaint";
      } else if (bounceType === "soft" && newCount >= SOFT_BOUNCE_THRESHOLD) {
        nextStatus = "bounced";
        archiveReason = "soft_bounce_threshold";
      }

      const contactUpdate: Record<string, unknown> = {
        bounce_count: newCount,
        last_bounce_at: nowIso,
        last_bounce_type: bounceType,
      };
      if (nextStatus) contactUpdate.status = nextStatus;
      if (archiveReason && !alreadyArchived) {
        contactUpdate.archived_at = nowIso;
        contactUpdate.archive_reason = archiveReason;
      }
      await admin
        .from("contacts")
        .update(contactUpdate)
        .eq("id", row.contact_id);

      if (archiveReason && !alreadyArchived) {
        archivedContactIds.add(row.contact_id);
        result.contacts_archived++;
      }

      // Mirror to queue_recipients linked to this campaign_recipient
      await admin
        .from("queue_recipients")
        .update({ status: "bounced" })
        .eq("campaign_recipient_id", row.id);

      await admin.from("activity_log").insert({
        user_id: account.user_id,
        workspace_id: row.workspace_id,
        activity_type: "email_bounced",
        entity_type: "campaign_recipient",
        entity_id: row.id,
        metadata: {
          contact_email: row.contact_email,
          bounce_type: bounceType,
          bounce_count: newCount,
          archived: !!archiveReason && !alreadyArchived,
          bounce_snippet: errorSnippet.slice(0, 240),
        },
      });

      result.bounces_recorded++;
      if (bounceType === "hard") {
        result.hard++;
        domainsToReevaluate.add(domainOf(row.contact_email));
      } else if (bounceType === "soft") result.soft++;
      else if (bounceType === "block") result.blocked++;
      else if (bounceType === "spam") result.spam++;
    }
  }

  // Cleanup all pending queue_recipients for the freshly archived contacts —
  // saves the queue-runner from waking up only to skip them.
  if (archivedContactIds.size > 0) {
    await cleanupPendingQueueRecipients(admin, Array.from(archivedContactIds));
  }

  // Re-check each affected domain — block whole domain if threshold hit.
  for (const domain of domainsToReevaluate) {
    const r = await maybeBlockDomain(admin, account.user_id, domain);
    if (r.blocked) {
      result.domains_blocked++;
      result.contacts_archived += r.archived;
    }
  }

  return result;
}
