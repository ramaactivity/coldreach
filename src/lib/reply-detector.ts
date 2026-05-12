import { google } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken, refreshAccessToken } from "@/lib/gmail";
import { bumpContactEngagement } from "@/lib/engagement";
import { classifyReply, type ReplyClass } from "@/lib/reply-classifier";

const REPLY_LOOKBACK_DAYS = 30;
const MAX_RECIPIENTS_PER_ACCOUNT_PER_RUN = 100;

type EmailAccountRow = {
  id: string;
  user_id: string;
  email: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_expires_at: string;
};

type RecipientRow = {
  id: string;
  user_id: string;
  workspace_id: string;
  contact_id: string;
  contact_email: string;
  gmail_thread_id: string;
  sent_at: string;
};

export type ReplyPollResult = {
  account_email: string;
  checked: number;
  replies_found: number;
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

function extractFrom(headerValue: string | null | undefined): string {
  if (!headerValue) return "";
  // "Name <email@example.com>" or just "email@example.com"
  const m = headerValue.match(/<([^>]+)>/);
  return (m?.[1] ?? headerValue).trim().toLowerCase();
}

// Bounce / DSN / autoresponder senders. Gmail threads delivery failures and
// "out of office" autoresponders back into the original outgoing thread, so
// without this filter we'd mark the contact as having replied when really
// the message we received was a bounce or a system notification.
function isBounceOrSystemSender(fromEmail: string): boolean {
  if (!fromEmail) return true;
  const lower = fromEmail.toLowerCase();
  if (lower.includes("mailer-daemon")) return true;
  if (lower.startsWith("postmaster@")) return true;
  if (lower.startsWith("noreply@")) return true;
  if (lower.startsWith("no-reply@")) return true;
  if (lower.startsWith("do-not-reply@")) return true;
  if (lower.startsWith("bounce@")) return true;
  if (lower.startsWith("bounces@")) return true;
  if (lower.startsWith("bounce-")) return true;
  if (lower.startsWith("mailerdaemon@")) return true;
  return false;
}

// Subject markers that scream "this is a delivery failure / autoresponder",
// not an actual reply. Covers Gmail (English + Indonesian localisation),
// Microsoft Exchange, and most SMTP-RFC-3464 wrappers we've seen.
function isLikelyDsnSubject(subject: string): boolean {
  if (!subject) return false;
  const s = subject.toLowerCase();
  return (
    s.includes("undeliverable") ||
    s.includes("undelivered") ||
    s.includes("delivery status notification") ||
    s.includes("delivery failure") ||
    s.includes("failure notice") ||
    s.includes("returned mail") ||
    s.includes("message blocked") ||
    s.includes("mail delivery failed") ||
    s.includes("mail delivery subsystem") ||
    s.includes("address not found") ||
    s.includes("tidak terkirim") || // Gmail ID localisation
    s.includes("automatic reply") ||
    s.includes("auto-reply") ||
    s.includes("out of office") ||
    s.includes("autoresponder")
  );
}

// RFC 3834: legitimate autoresponders / DSNs set Auto-Submitted to a
// non-"no" value. If we see this, it's not a human reply.
function isAutoSubmitted(autoSubmitted: string | null | undefined): boolean {
  if (!autoSubmitted) return false;
  const v = autoSubmitted.toLowerCase().trim();
  return v !== "" && v !== "no";
}

function decodeBase64Url(s: string): string {
  const normalized = s.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Buffer.from(normalized, "base64").toString("utf8");
  } catch {
    return "";
  }
}

// Walk Gmail payload tree and pull text/plain bodies first, fall back to
// stripped text/html. Used for reply classification — the classifier only
// needs the gist, not the formatting.
function extractBodyText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as {
    mimeType?: string;
    body?: { data?: string };
    parts?: unknown[];
  };
  let plain = "";
  let html = "";

  function walk(node: typeof p): void {
    if (node.body?.data) {
      const decoded = decodeBase64Url(node.body.data);
      if (node.mimeType?.startsWith("text/plain")) plain += decoded + "\n";
      else if (node.mimeType?.startsWith("text/html")) html += decoded + "\n";
    }
    if (Array.isArray(node.parts)) {
      for (const part of node.parts) walk(part as typeof p);
    }
  }
  walk(p);

  if (plain.trim().length > 0) return plain;
  if (html.trim().length > 0) {
    // Lightweight HTML strip — good enough for classifier intake.
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return "";
}

/**
 * Poll Gmail threads for replies to sent emails. Updates campaign_recipients
 * status to 'replied' when a thread has a message from a non-account address
 * after our sent_at.
 */
export async function pollRepliesForAccount(
  admin: SupabaseClient,
  account: EmailAccountRow,
): Promise<ReplyPollResult> {
  const result: ReplyPollResult = {
    account_email: account.email,
    checked: 0,
    replies_found: 0,
    errors: [],
  };

  const cutoff = new Date(
    Date.now() - REPLY_LOOKBACK_DAYS * 24 * 3600 * 1000,
  ).toISOString();

  const { data: candidates } = await admin
    .from("campaign_recipients")
    .select(
      "id, user_id, workspace_id, contact_id, contact_email, gmail_thread_id, sent_at",
    )
    .eq("user_id", account.user_id)
    .in("status", ["sent", "opened"])
    .not("gmail_thread_id", "is", null)
    .gte("sent_at", cutoff)
    .order("sent_at", { ascending: false })
    .limit(MAX_RECIPIENTS_PER_ACCOUNT_PER_RUN);

  if (!candidates || candidates.length === 0) {
    return result;
  }

  let accessToken: string;
  try {
    accessToken = await getFreshToken(admin, account);
  } catch (err) {
    result.errors.push(
      `Token refresh failed: ${err instanceof Error ? err.message : "unknown"}`,
    );
    return result;
  }

  const oauth = new google.auth.OAuth2();
  oauth.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth: oauth });

  const accountEmailLower = account.email.toLowerCase();

  for (const cand of candidates as RecipientRow[]) {
    result.checked++;
    try {
      const thread = await gmail.users.threads.get({
        userId: "me",
        id: cand.gmail_thread_id,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Auto-Submitted", "Date"],
      });

      const messages = thread.data.messages ?? [];
      if (messages.length <= 1) continue; // no replies yet

      const sentAtMs = new Date(cand.sent_at).getTime();

      const replyMessage = messages.find((msg) => {
        const headers = msg.payload?.headers ?? [];
        const get = (name: string) =>
          headers.find((h) => h.name?.toLowerCase() === name)?.value ?? "";
        const fromEmail = extractFrom(get("from"));
        if (!fromEmail || fromEmail === accountEmailLower) return false;
        const internalDate = parseInt(msg.internalDate ?? "0", 10);
        if (internalDate <= sentAtMs) return false;
        // Drop bounces, postmaster notices, and OOO autoresponders so they
        // don't get counted as replies. Bounce detector handles them on its
        // own pass; auto-replies aren't actionable engagement.
        if (isBounceOrSystemSender(fromEmail)) return false;
        if (isLikelyDsnSubject(get("subject"))) return false;
        if (isAutoSubmitted(get("auto-submitted"))) return false;
        return true;
      });

      if (!replyMessage) continue;

      const repliedAt = new Date(
        parseInt(replyMessage.internalDate ?? Date.now().toString(), 10),
      ).toISOString();

      // Pull the full reply body so we can classify it. Best-effort:
      // failures fall through with classification=null.
      let classification: ReplyClass | null = null;
      try {
        const replyFull = await gmail.users.messages.get({
          userId: "me",
          id: replyMessage.id ?? "",
          format: "full",
        });
        const bodyText = extractBodyText(replyFull.data.payload);
        if (bodyText) {
          classification = await classifyReply(bodyText);
        }
      } catch (classifyErr) {
        // Don't fail the whole reply detection just because classifier
        // couldn't fetch / classify.
        const msg =
          classifyErr instanceof Error ? classifyErr.message : "unknown";
        result.errors.push(`classify ${replyMessage.id}: ${msg}`);
      }

      // Update campaign_recipient
      await admin
        .from("campaign_recipients")
        .update({
          status: "replied",
          replied_at: repliedAt,
          reply_classification: classification,
        })
        .eq("id", cand.id);

      // Update workspace data stats
      await admin
        .from("contact_workspace_data")
        .upsert(
          {
            contact_id: cand.contact_id,
            workspace_id: cand.workspace_id,
            user_id: cand.user_id,
            last_replied_at: repliedAt,
          },
          { onConflict: "contact_id,workspace_id" },
        );

      // Global engagement signal — replies are 15× more valuable than opens
      // in the score formula, so bump and recompute.
      await bumpContactEngagement(admin, cand.contact_id, "reply");

      // Update queue_recipients linked to this campaign_recipient
      await admin
        .from("queue_recipients")
        .update({ status: "replied" })
        .eq("campaign_recipient_id", cand.id);

      // Auto-archive on explicit unsubscribe — same path as the
      // /unsubscribe/[token] route, just triggered from a free-form reply.
      if (classification === "unsubscribe_request") {
        await admin
          .from("contacts")
          .update({
            status: "unsubscribed",
            archived_at: repliedAt,
            archive_reason: "unsubscribed",
          })
          .eq("id", cand.contact_id);
      }

      // Activity log
      await admin.from("activity_log").insert({
        user_id: cand.user_id,
        workspace_id: cand.workspace_id,
        activity_type: "email_replied",
        entity_type: "campaign_recipient",
        entity_id: cand.id,
        metadata: {
          contact_email: cand.contact_email,
          classification,
        },
      });

      result.replies_found++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      result.errors.push(`Thread ${cand.gmail_thread_id}: ${msg}`);
    }
  }

  return result;
}
