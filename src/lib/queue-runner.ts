import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, type EmailAccount } from "@/lib/email-sender";
import { generateOpener } from "@/lib/ai-opener";

export type RunQueueResult = {
  queue_id: string;
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: string[];
};

const DEFAULT_BATCH_SIZE = 5;
const DELAY_MIN_MS = 30_000;
const DELAY_MAX_MS = 90_000;

// Start of today in WIB (UTC+7), returned as a UTC ISO string.
function startOfTodayWIB(): string {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 3600 * 1000);
  wib.setUTCHours(0, 0, 0, 0);
  return new Date(wib.getTime() - 7 * 3600 * 1000).toISOString();
}

/**
 * Process up to `batchSize` pending recipients in a queue.
 * Used by manual "Run Now" and the cron job.
 *
 * Uses admin client because cron has no auth user context.
 */
export async function runQueue(
  queueId: string,
  batchSize: number = DEFAULT_BATCH_SIZE,
  applyDelay: boolean = true,
): Promise<RunQueueResult> {
  const admin = createAdminClient();
  const result: RunQueueResult = {
    queue_id: queueId,
    attempted: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  const { data: queue } = await admin
    .from("send_queues")
    .select("*")
    .eq("id", queueId)
    .maybeSingle();
  if (!queue) {
    result.errors.push("Queue not found");
    return result;
  }
  if (!queue.is_active) {
    result.errors.push("Queue is paused");
    return result;
  }
  if (!queue.template_id) {
    result.errors.push("Queue has no template");
    return result;
  }

  const { data: account } = await admin
    .from("email_accounts")
    .select(
      "id, email, display_name, access_token_encrypted, refresh_token_encrypted, token_expires_at, is_active, daily_quota, emails_sent_today",
    )
    .eq("workspace_id", queue.workspace_id)
    .eq("is_active", true)
    .maybeSingle();
  if (!account) {
    result.errors.push("No connected Gmail for this workspace");
    return result;
  }

  const remainingQuota = account.daily_quota - account.emails_sent_today;
  if (remainingQuota <= 0) {
    result.errors.push("Daily quota exhausted");
    return result;
  }

  const { data: template } = await admin
    .from("templates")
    .select("id, subject_lines, body_plain")
    .eq("id", queue.template_id)
    .maybeSingle();
  if (!template) {
    result.errors.push("Template not found");
    return result;
  }
  const { data: attachments } = await admin
    .from("template_attachments")
    .select("filename, storage_path, mime_type")
    .eq("template_id", queue.template_id);

  const limit = Math.min(batchSize, remainingQuota);
  const { data: recipients } = await admin
    .from("queue_recipients")
    .select(
      `id, priority,
       contact:contacts!inner(
         id, email, first_name, last_name, company, position, status,
         total_emails_sent_all_workspaces
       )`,
    )
    .eq("queue_id", queueId)
    .eq("status", "pending")
    .order("priority", { ascending: false })
    .limit(limit);

  if (!recipients || recipients.length === 0) {
    return result;
  }

  // Fetch workspace meta for AI opener prompt context
  let workspaceMeta: { name: string; business_type: string | null } | null =
    null;
  let workspaceSignature: string | null = null;
  // One workspace fetch covers AI-opener metadata + signature
  {
    const { data: ws } = await admin
      .from("workspaces")
      .select("name, business_type, default_signature")
      .eq("id", queue.workspace_id)
      .maybeSingle();
    if (ws) {
      if (queue.use_ai_opener) {
        workspaceMeta = { name: ws.name, business_type: ws.business_type };
      }
      workspaceSignature =
        (ws as { default_signature: string | null }).default_signature ?? null;
    }
  }

  // Pre-fetch cached AI openers for all candidate contacts in this batch
  const candidateContactIds = recipients
    .map((r) => {
      const c = (r as { contact: unknown }).contact;
      if (Array.isArray(c)) return c[0]?.id;
      return (c as { id?: string } | null)?.id;
    })
    .filter((id): id is string => typeof id === "string");

  const openerCache = new Map<string, string>();
  if (queue.use_ai_opener && candidateContactIds.length > 0) {
    const { data: cached } = await admin
      .from("contact_workspace_data")
      .select("contact_id, ai_opener")
      .eq("workspace_id", queue.workspace_id)
      .in("contact_id", candidateContactIds)
      .not("ai_opener", "is", null);
    for (const row of cached ?? []) {
      const r = row as { contact_id: string; ai_opener: string | null };
      if (r.ai_opener) openerCache.set(r.contact_id, r.ai_opener);
    }
  }

  // Cross-workspace daily dedup: any contact_email already received an email
  // today (under this user, across any workspace) is skipped. Includes
  // in-flight 'sending' rows so we don't double-send when a previous batch
  // timed out mid-iteration.
  const candidateEmailsLower = recipients
    .map((r) => {
      const c = (r as { contact: unknown }).contact;
      const obj = Array.isArray(c) ? c[0] : (c as { email?: string } | null);
      return obj?.email?.toLowerCase() ?? null;
    })
    .filter((e): e is string => !!e);

  const dedupedEmails = new Set<string>();
  if (candidateEmailsLower.length > 0) {
    const todayStartIso = startOfTodayWIB();
    // Use created_at (always set) instead of sent_at (NULL for 'sending'
    // rows) so we also catch in-flight rows from a prior batch that timed
    // out mid-iteration.
    const { data: alreadySent } = await admin
      .from("campaign_recipients")
      .select("contact_email")
      .eq("user_id", queue.user_id)
      .gte("created_at", todayStartIso)
      .in("status", ["sending", "sent", "opened", "replied"])
      .in("contact_email", candidateEmailsLower);
    for (const row of alreadySent ?? []) {
      const e = (row as { contact_email: string | null }).contact_email;
      if (e) dedupedEmails.add(e.toLowerCase());
    }
  }

  let queueTotalSent = queue.total_sent;
  let queuePending = queue.total_pending;
  let accountSentToday = account.emails_sent_today;

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i] as unknown as {
      id: string;
      contact:
        | {
            id: string;
            email: string;
            first_name: string | null;
            last_name: string | null;
            company: string | null;
            position: string | null;
            status: string;
            total_emails_sent_all_workspaces: number;
          }
        | Array<{
            id: string;
            email: string;
            first_name: string | null;
            last_name: string | null;
            company: string | null;
            position: string | null;
            status: string;
            total_emails_sent_all_workspaces: number;
          }>
        | null;
    };
    result.attempted++;

    // Supabase may return the inner-joined relation as either an object
    // (for many-to-one) or an array. Normalize to a single object.
    const contact = Array.isArray(recipient.contact)
      ? (recipient.contact[0] ?? null)
      : recipient.contact;
    if (!contact) {
      result.skipped++;
      continue;
    }
    if (contact.status !== "active") {
      await admin
        .from("queue_recipients")
        .update({ status: "skipped" })
        .eq("id", recipient.id);
      result.skipped++;
      continue;
    }

    // Cross-workspace daily dedup: if this contact's email already received
    // (or is mid-receiving) an email today from any of this user's
    // workspaces, skip — leave queue_recipient pending so it's retried
    // tomorrow.
    if (dedupedEmails.has(contact.email.toLowerCase())) {
      await admin
        .from("queue_recipients")
        .update({ status: "skipped" })
        .eq("id", recipient.id);
      result.skipped++;
      continue;
    }

    // Resolve AI opener: cache → generate → fallback null
    let aiOpener: string | null = null;
    if (queue.use_ai_opener && workspaceMeta) {
      aiOpener = openerCache.get(contact.id) ?? null;
      if (!aiOpener) {
        aiOpener = await generateOpener({
          workspace_name: workspaceMeta.name,
          workspace_business_type: workspaceMeta.business_type,
          contact_first_name: contact.first_name,
          contact_company: contact.company,
          contact_position: contact.position,
        });
        if (aiOpener) {
          // Cache for future runs (upsert into contact_workspace_data)
          await admin
            .from("contact_workspace_data")
            .upsert(
              {
                contact_id: contact.id,
                workspace_id: queue.workspace_id,
                user_id: queue.user_id,
                ai_opener: aiOpener,
                ai_opener_generated_at: new Date().toISOString(),
              },
              { onConflict: "contact_id,workspace_id" },
            );
        }
      }
    }

    // Pre-create campaign_recipient row so we can embed its ID as tracking pixel URL
    const { data: campaignRecipient } = await admin
      .from("campaign_recipients")
      .insert({
        campaign_id: null,
        contact_id: contact.id,
        user_id: queue.user_id,
        workspace_id: queue.workspace_id,
        contact_email: contact.email,
        status: "sending",
      })
      .select("id")
      .maybeSingle();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const trackingUrl = campaignRecipient?.id
      ? `${appUrl}/api/track/open/${campaignRecipient.id}`
      : null;
    const clickTrackingBase = campaignRecipient?.id
      ? `${appUrl}/api/track/click/${campaignRecipient.id}`
      : null;

    // TEST MODE safety: redirect to connected Gmail account so we never
    // accidentally blast real recipients while iterating. Subject prefixed
    // with [TEST] so it's obvious in inbox.
    const testModeContact = queue.test_mode
      ? {
          ...contact,
          email: account.email,
          first_name: contact.first_name
            ? `[TEST → ${contact.email}] ${contact.first_name}`
            : contact.first_name,
        }
      : contact;

    const sendResult = await sendEmail(admin, {
      account: account as EmailAccount,
      contact: testModeContact,
      template,
      attachments: attachments ?? [],
      aiOpener,
      trackingUrl,
      clickTrackingBase,
      subjectPrefix: queue.test_mode ? "[TEST]" : null,
      signature: workspaceSignature,
    });

    if (!sendResult.ok) {
      result.failed++;
      result.errors.push(`${contact.email}: ${sendResult.error}`);
      // Mark the pre-created campaign_recipient as failed so we don't leave orphans
      if (campaignRecipient?.id) {
        await admin
          .from("campaign_recipients")
          .update({
            status: "failed",
            failed_at: new Date().toISOString(),
            error_message: sendResult.error,
          })
          .eq("id", campaignRecipient.id);
      }
      continue;
    }

    // Counter bookkeeping (in-memory; DB writes follow in parallel below)
    queueTotalSent++;
    queuePending = Math.max(0, queuePending - 1);
    accountSentToday++;
    const nowIso = new Date().toISOString();

    // All post-send DB writes are independent — fire in parallel to keep
    // per-iteration latency low and survive Vercel's 60s cap on bigger
    // batches. campaign_recipients first ensures stats see 'sent' fastest.
    await Promise.all([
      campaignRecipient?.id
        ? admin
            .from("campaign_recipients")
            .update({
              status: "sent",
              sent_at: nowIso,
              gmail_message_id: sendResult.gmail_message_id,
              gmail_thread_id: sendResult.gmail_thread_id,
              gmail_subject_used: sendResult.subject_used,
            })
            .eq("id", campaignRecipient.id)
        : Promise.resolve(),
      admin
        .from("queue_recipients")
        .update({
          status: "sent",
          sent_at: nowIso,
          campaign_recipient_id: campaignRecipient?.id ?? null,
        })
        .eq("id", recipient.id),
      admin.from("contact_workspace_data").upsert(
        {
          contact_id: contact.id,
          workspace_id: queue.workspace_id,
          user_id: queue.user_id,
          last_contacted_at: nowIso,
        },
        { onConflict: "contact_id,workspace_id" },
      ),
      admin
        .from("contacts")
        .update({
          total_emails_sent_all_workspaces:
            contact.total_emails_sent_all_workspaces + 1,
          last_contacted_at_any: nowIso,
        })
        .eq("id", contact.id),
      admin
        .from("send_queues")
        .update({
          total_sent: queueTotalSent,
          total_pending: queuePending,
          last_run_at: nowIso,
        })
        .eq("id", queueId),
      admin
        .from("email_accounts")
        .update({
          emails_sent_today: accountSentToday,
          last_used_at: nowIso,
        })
        .eq("id", account.id),
    ]);

    // Track the just-sent email so dedup catches subsequent recipients in
    // the same batch (the DB query at batch start can't see this row yet).
    dedupedEmails.add(contact.email.toLowerCase());

    result.sent++;

    // Delay before next send (skip last)
    if (applyDelay && i < recipients.length - 1) {
      const delay = DELAY_MIN_MS + Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // One-shot campaigns: auto-deactivate when fully sent so dashboard
  // surfaces them as "completed" and cron stops picking them up.
  if (queue.is_one_shot && queuePending === 0 && result.sent > 0) {
    await admin
      .from("send_queues")
      .update({ is_active: false })
      .eq("id", queueId);
  }

  return result;
}
