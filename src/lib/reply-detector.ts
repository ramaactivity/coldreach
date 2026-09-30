import { google } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken, refreshAccessToken } from "@/lib/gmail";
import { bumpContactEngagement } from "@/lib/engagement";
import {
  classifyReply,
  extractReturnDate,
  type ReplyClass,
} from "@/lib/reply-classifier";
import { isOutOfOffice, resolveReturnDate, wibDate } from "@/lib/ooo";
import { fetchRecentInbox, type SmtpConfig } from "@/lib/imap-smtp";

const REPLY_LOOKBACK_DAYS = 30;
const MAX_RECIPIENTS_PER_ACCOUNT_PER_RUN = 100;
// Process candidates this many at a time. Gmail allows ~25 req/sec/user
// (threads.get is 10 quota units; user has 250 units/sec budget). 8 keeps
// us well under and slashes wall-clock — and therefore Provisioned Memory
// charge — by roughly the same factor.
const CONCURRENCY = 8;

// IMAP fetches the whole INBOX window each run; the cron polls every 30 min,
// so a few days of overlap is plenty.
const IMAP_LOOKBACK_DAYS = 3;

type EmailAccountRow = {
  id: string;
  user_id: string;
  workspace_id: string | null;
  email: string;
  provider?: string | null;
  smtp_config?: SmtpConfig | null;
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
  gmail_message_id: string | null;
  gmail_thread_id: string;
  sent_at: string;
  ooo_detected_at: string | null;
};

export type ReplyPollResult = {
  account_email: string;
  checked: number;
  replies_found: number;
  ooo_found: number;
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

// Bounce / DSN / system senders. Gmail threads delivery failures and
// "out of office" autoresponders back into the original outgoing thread, so
// without this filter we'd mark the contact as having replied when really
// the message we received was a bounce or a system notification.
function isBounceOrSystemSender(fromEmail: string): boolean {
  if (!fromEmail) return true;
  const lower = fromEmail.toLowerCase();
  if (lower.includes("mailer-daemon")) return true;
  if (lower.includes("postmaster")) return true;
  if (lower.startsWith("mdaemon@")) return true; // MDaemon mail server DSNs
  if (lower.startsWith("noreply@")) return true;
  if (lower.startsWith("no-reply@")) return true;
  if (lower.startsWith("do-not-reply@")) return true;
  if (lower.startsWith("bounce@")) return true;
  if (lower.startsWith("bounces@")) return true;
  if (lower.startsWith("bounce-")) return true;
  if (lower.startsWith("mailerdaemon@")) return true;
  return false;
}

// Subject markers that scream "this is a delivery failure", not an actual
// reply. Auto-replies (OOO) are recognised separately by isOutOfOffice. Covers Gmail (English + Indonesian localisation),
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
    s.includes("quarantine") ||
    s.includes("delivery incomplete") ||
    s.includes("delivery has failed") ||
    s.includes("not delivered") ||
    s.includes("couldn't be delivered") ||
    s.includes("could not be delivered") ||
    s.includes("tidak terkirim") // Gmail ID localisation
  );
}

// Some servers send DSNs from an ordinary-looking address with the original
// subject kept (e.g. MDaemon: "benediktus@… - no such user here"), so the
// sender/subject checks miss them. A body that reads like a delivery failure
// is never a human reply — leave it for the bounce detector.
const DSN_BODY_RX =
  /no such user|user unknown|address not found|recipient address rejected|couldn't be delivered|could not be delivered|wasn't delivered|was not delivered|message blocked|has been quarantined|delivery has failed|mailbox unavailable|550[ -]5\.\d\.\d/i;
function looksLikeBounce(body: string): boolean {
  return DSN_BODY_RX.test(body.slice(0, 2000));
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
    ooo_found: 0,
    errors: [],
  };

  const cutoff = new Date(
    Date.now() - REPLY_LOOKBACK_DAYS * 24 * 3600 * 1000,
  ).toISOString();

  // Scope to this account's workspace (1 account = 1 workspace): otherwise
  // every account polls the same newest-100 rows of the whole user, so a busy
  // workspace crowds out the others and threads 404 on the wrong mailbox.
  let candidateQuery = admin
    .from("campaign_recipients")
    .select(
      "id, user_id, workspace_id, contact_id, contact_email, gmail_message_id, gmail_thread_id, sent_at, ooo_detected_at",
    )
    .eq("user_id", account.user_id);
  if (account.workspace_id) {
    candidateQuery = candidateQuery.eq("workspace_id", account.workspace_id);
  }
  const { data: candidates } = await candidateQuery
    .in("status", ["sent", "opened"])
    .not("gmail_thread_id", "is", null)
    // Recipients on leave stay in the window until they are back, so a real
    // reply after a long leave is still caught.
    .or(`sent_at.gte.${cutoff},ooo_until.gte.${wibDate(Date.now())}`)
    .order("sent_at", { ascending: false })
    .limit(MAX_RECIPIENTS_PER_ACCOUNT_PER_RUN);

  if (!candidates || candidates.length === 0) {
    return result;
  }

  if (account.provider === "smtp" && account.smtp_config) {
    await pollRepliesImap(admin, account, account.smtp_config, candidates as RecipientRow[], result);
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

  // Process candidates CONCURRENCY at a time. The per-candidate work is
  // I/O-bound (Gmail API + DB) so wall-clock collapses near-linearly with
  // parallelism, which is what Provisioned Memory is billed on.
  const candidateRows = candidates as RecipientRow[];
  const oooThreads = new Set<string>();
  for (let i = 0; i < candidateRows.length; i += CONCURRENCY) {
    const batch = candidateRows.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map((cand) => processCandidate(cand)));
  }

  return result;

  async function processCandidate(cand: RecipientRow): Promise<void> {
    result.checked++;
    try {
      const thread = await gmail.users.threads.get({
        userId: "me",
        id: cand.gmail_thread_id,
        format: "metadata",
        metadataHeaders: [
          "From",
          "Subject",
          "Auto-Submitted",
          "X-Autoreply",
          "Precedence",
          "Date",
        ],
      });

      const messages = thread.data.messages ?? [];
      if (messages.length <= 1) return; // no replies yet

      // Messages up to the last recorded auto-reply were already handled.
      const handledUpTo = Math.max(
        new Date(cand.sent_at).getTime(),
        cand.ooo_detected_at ? new Date(cand.ooo_detected_at).getTime() : 0,
      );
      type Msg = (typeof messages)[number];
      const header = (msg: Msg, name: string) =>
        msg.payload?.headers?.find((h) => h.name?.toLowerCase() === name)
          ?.value ?? "";
      const receivedMs = (msg: Msg) => parseInt(msg.internalDate ?? "0", 10);
      const isAuto = (msg: Msg) =>
        isOutOfOffice({
          subject: header(msg, "subject"),
          autoSubmitted: header(msg, "auto-submitted"),
          xAutoreply: header(msg, "x-autoreply"),
          precedence: header(msg, "precedence"),
        });
      // Inbound = from someone else, after what we already handled, and not
      // a bounce/DSN (the bounce detector owns those).
      const inbound = messages.filter((msg) => {
        const fromEmail = extractFrom(header(msg, "from"));
        return (
          !!fromEmail &&
          fromEmail !== accountEmailLower &&
          receivedMs(msg) > handledUpTo &&
          !isBounceOrSystemSender(fromEmail) &&
          !isLikelyDsnSubject(header(msg, "subject"))
        );
      });
      const replyMessage = inbound.find((msg) => !isAuto(msg));
      const oooMessage = inbound.filter(isAuto).at(-1);
      const picked = replyMessage ?? oooMessage;
      if (!picked) return;

      let bodyText = "";
      try {
        const full = await gmail.users.messages.get({
          userId: "me",
          id: picked.id ?? "",
          format: "full",
        });
        bodyText = extractBodyText(full.data.payload);
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : "unknown";
        result.errors.push(`messages.get ${picked.id}: ${msg}`);
      }

      if (!replyMessage) {
        if (await recordOoo(admin, cand, receivedMs(picked), bodyText, oooThreads)) {
          result.ooo_found++;
        }
        return;
      }

      if (looksLikeBounce(bodyText)) return;

      const repliedAt = new Date(receivedMs(replyMessage)).toISOString();
      // Best-effort: classifier failure leaves classification=null.
      const classification = bodyText ? await classifyReply(bodyText) : null;
      // A hand-typed "saya sedang cuti" has no auto-reply headers; treat it
      // like one so the follow-up waits instead of the thread closing.
      if (classification === "out_of_office") {
        if (await recordOoo(admin, cand, receivedMs(replyMessage), bodyText, oooThreads)) {
          result.ooo_found++;
        }
        return;
      }

      await recordReply(admin, cand, repliedAt, classification);

      // Hot leads float to the top of the Gmail inbox the team works from.
      if (classification === "interested" || classification === "question") {
        await gmail.users.threads
          .modify({
            userId: "me",
            id: cand.gmail_thread_id,
            requestBody: { addLabelIds: ["STARRED", "IMPORTANT"] },
          })
          .catch(() => {});
      }

      result.replies_found++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      result.errors.push(`Thread ${cand.gmail_thread_id}: ${msg}`);
    }
  }
}

async function recordReply(
  admin: SupabaseClient,
  cand: RecipientRow,
  repliedAt: string,
  classification: ReplyClass | null,
): Promise<void> {
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

  await advanceLeadStage(admin, cand, classification);

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
}

/**
 * IMAP variant for provider='smtp' accounts. No server-side threads, so a
 * reply is matched to a recipient by In-Reply-To/References containing the
 * Message-ID we stamped (stored in gmail_message_id / gmail_thread_id), with
 * a fallback of "sender == contact email, received after we sent".
 */
async function pollRepliesImap(
  admin: SupabaseClient,
  account: EmailAccountRow,
  cfg: SmtpConfig,
  candidates: RecipientRow[],
  result: ReplyPollResult,
): Promise<void> {
  let inbox;
  try {
    inbox = await fetchRecentInbox(account.email, cfg, IMAP_LOOKBACK_DAYS);
  } catch (err) {
    result.errors.push(`IMAP: ${err instanceof Error ? err.message : "unknown"}`);
    return;
  }
  const self = account.email.toLowerCase();
  const inbound = inbox.filter(
    (m) =>
      m.from &&
      m.from !== self &&
      !isBounceOrSystemSender(m.from) &&
      !isLikelyDsnSubject(m.subject),
  );
  if (inbound.length === 0) return;

  const oooThreads = new Set<string>();
  for (const cand of candidates) {
    result.checked++;
    const handledUpTo = Math.max(
      new Date(cand.sent_at).getTime(),
      cand.ooo_detected_at ? new Date(cand.ooo_detected_at).getTime() : 0,
    );
    const ids = [cand.gmail_thread_id, cand.gmail_message_id].filter(Boolean);
    const mine = inbound.filter((m) => {
      if (m.date.getTime() <= handledUpTo) return false;
      const refs = [m.inReplyTo, ...m.references];
      return (
        refs.some((r) => r && ids.includes(r)) ||
        m.from === cand.contact_email.toLowerCase()
      );
    });
    const reply = mine.find((m) => !isOutOfOffice(m));
    const ooo = mine.filter((m) => isOutOfOffice(m)).at(-1);
    try {
      if (reply && !looksLikeBounce(reply.text)) {
        const classification = reply.text.trim()
          ? await classifyReply(reply.text)
          : null;
        if (classification === "out_of_office") {
          if (await recordOoo(admin, cand, reply.date.getTime(), reply.text, oooThreads)) {
            result.ooo_found++;
          }
        } else {
          await recordReply(admin, cand, reply.date.toISOString(), classification);
          result.replies_found++;
        }
      } else if (ooo) {
        if (await recordOoo(admin, cand, ooo.date.getTime(), ooo.text, oooThreads)) {
          result.ooo_found++;
        }
      }
    } catch (err) {
      result.errors.push(`${cand.contact_email}: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }
}

/**
 * Out-of-office auto-reply: store the return date on every recipient row in
 * the thread (original + follow-ups share gmail_thread_id) so the follow-up
 * runner holds the next step until then. The row stays 'sent' — an auto-reply
 * is not engagement and must not end the sequence.
 */
async function recordOoo(
  admin: SupabaseClient,
  cand: RecipientRow,
  receivedMs: number,
  text: string,
  /** Threads already recorded this run — original + follow-up rows share a
   *  thread, so the same auto-reply would otherwise be parsed and logged twice. */
  seen: Set<string>,
): Promise<boolean> {
  if (seen.has(cand.gmail_thread_id)) return false;
  seen.add(cand.gmail_thread_id);
  const parsed = await extractReturnDate(text, wibDate(receivedMs));
  const { until, parsed: dateFound } = resolveReturnDate(parsed, receivedMs);
  await admin
    .from("campaign_recipients")
    .update({
      ooo_until: until,
      ooo_detected_at: new Date(receivedMs).toISOString(),
    })
    .eq("user_id", cand.user_id)
    .eq("gmail_thread_id", cand.gmail_thread_id);
  await admin.from("activity_log").insert({
    user_id: cand.user_id,
    workspace_id: cand.workspace_id,
    activity_type: "email_out_of_office",
    entity_type: "campaign_recipient",
    entity_id: cand.id,
    metadata: {
      contact_email: cand.contact_email,
      return_date: until,
      date_found: dateFound,
    },
  });
  return true;
}

type PipelineStage = { id: string; order?: number; is_terminal?: boolean };
// Stages a lead can be auto-moved OUT of; anything later was set by a human.
const EARLY_STAGES = new Set(["new", "contacted"]);

/**
 * Move the lead along the workspace pipeline from its reply: interested /
 * question → the first working stage after "contacted" (e.g. "Tertarik Food
 * Tasting", "Tanya Pricelist"); not interested / unsubscribe → the "lost"
 * stage. Only leads still at new/contacted move — manual progress wins.
 */
async function advanceLeadStage(
  admin: SupabaseClient,
  cand: RecipientRow,
  classification: ReplyClass | null,
): Promise<void> {
  const positive = classification === "interested" || classification === "question";
  const negative =
    classification === "not_interested" || classification === "unsubscribe_request";
  if (!positive && !negative) return;

  const [{ data: ws }, { data: cwd }] = await Promise.all([
    admin
      .from("workspaces")
      .select("pipeline_stages")
      .eq("id", cand.workspace_id)
      .maybeSingle(),
    admin
      .from("contact_workspace_data")
      .select("lead_stage_id")
      .eq("contact_id", cand.contact_id)
      .eq("workspace_id", cand.workspace_id)
      .maybeSingle(),
  ]);
  const current = (cwd as { lead_stage_id: string | null } | null)?.lead_stage_id;
  if (current && !EARLY_STAGES.has(current)) return;

  const stages = [
    ...(((ws as { pipeline_stages: PipelineStage[] | null } | null)
      ?.pipeline_stages ?? []) as PipelineStage[]),
  ].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const target = positive
    ? stages.find((st) => !EARLY_STAGES.has(st.id) && !st.is_terminal)
    : stages.find((st) => st.id === "lost");
  if (!target) return;

  await admin
    .from("contact_workspace_data")
    .upsert(
      {
        contact_id: cand.contact_id,
        workspace_id: cand.workspace_id,
        user_id: cand.user_id,
        lead_stage_id: target.id,
        lead_stage_updated_at: new Date().toISOString(),
      },
      { onConflict: "contact_id,workspace_id" },
    );
}

const OWNER_REPLY_BATCH = 60;

/**
 * Close the loop on replies the team already answered outside ColdReach:
 * a "replied" row whose thread has a message from our own account after the
 * prospect's reply gets handled_at set, so the inbox and the daily digest
 * only list replies that are genuinely still waiting.
 */
export async function markOwnerReplies(
  admin: SupabaseClient,
  account: EmailAccountRow,
): Promise<number> {
  if (!account.workspace_id) return 0;
  const { data: rows } = await admin
    .from("campaign_recipients")
    .select("id, contact_email, gmail_thread_id, replied_at")
    .eq("workspace_id", account.workspace_id)
    .eq("status", "replied")
    .is("handled_at", null)
    .not("replied_at", "is", null)
    .order("replied_at", { ascending: false })
    .limit(OWNER_REPLY_BATCH);
  const pending = (rows ?? []) as Array<{
    id: string;
    contact_email: string;
    gmail_thread_id: string | null;
    replied_at: string;
  }>;
  if (pending.length === 0) return 0;

  const self = account.email.toLowerCase();
  const answeredAt = new Map<string, number>();

  if (account.provider === "smtp" && account.smtp_config) {
    const oldest = Math.min(...pending.map((r) => Date.parse(r.replied_at)));
    const days = Math.min(30, Math.ceil((Date.now() - oldest) / 864e5) + 1);
    const sent = await fetchRecentInbox(account.email, account.smtp_config, days, 300, "sent");
    for (const r of pending) {
      const hit = sent.find(
        (m) =>
          m.to.includes(r.contact_email.toLowerCase()) &&
          m.date.getTime() > Date.parse(r.replied_at),
      );
      if (hit) answeredAt.set(r.id, hit.date.getTime());
    }
  } else {
    const oauth = new google.auth.OAuth2();
    oauth.setCredentials({ access_token: await getFreshToken(admin, account) });
    const gmail = google.gmail({ version: "v1", auth: oauth });
    for (let i = 0; i < pending.length; i += CONCURRENCY) {
      await Promise.all(
        pending.slice(i, i + CONCURRENCY).map(async (r) => {
          if (!r.gmail_thread_id) return;
          try {
            const t = await gmail.users.threads.get({
              userId: "me",
              id: r.gmail_thread_id,
              format: "metadata",
              metadataHeaders: ["From"],
            });
            const ours = (t.data.messages ?? []).find((m) => {
              const from = extractFrom(
                m.payload?.headers?.find((h) => h.name?.toLowerCase() === "from")?.value,
              );
              return from === self && Number(m.internalDate) > Date.parse(r.replied_at);
            });
            if (ours) answeredAt.set(r.id, Number(ours.internalDate));
          } catch {
            // Thread gone or not in this mailbox — leave it for manual handling.
          }
        }),
      );
    }
  }

  for (const [id, ms] of answeredAt) {
    await admin
      .from("campaign_recipients")
      .update({ handled_at: new Date(ms).toISOString() })
      .eq("id", id)
      .is("handled_at", null);
  }
  return answeredAt.size;
}
