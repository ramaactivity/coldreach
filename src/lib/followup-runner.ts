import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, type EmailAccount } from "@/lib/email-sender";
import { generateOpener } from "@/lib/ai-opener";

export type FollowupRunResult = {
  queue_id: string;
  attempted: number;
  sent: number;
  failed: number;
  errors: string[];
};

const MAX_FOLLOWUPS_PER_RUN = 10;

/**
 * Find queue_recipients in this queue that are eligible for a follow-up
 * (sent N+ days ago, not replied/bounced, no follow-up sent yet) and send
 * the queue's followup_template_id email threaded under the original.
 */
export async function runFollowupsForQueue(
  queueId: string,
): Promise<FollowupRunResult> {
  const admin = createAdminClient();
  const result: FollowupRunResult = {
    queue_id: queueId,
    attempted: 0,
    sent: 0,
    failed: 0,
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
    result.errors.push("Queue paused");
    return result;
  }
  if (!queue.followup_enabled || !queue.followup_template_id) {
    return result; // Not configured for follow-up
  }

  // Connected Gmail account
  const { data: account } = await admin
    .from("email_accounts")
    .select(
      "id, email, display_name, access_token_encrypted, refresh_token_encrypted, token_expires_at, is_active, daily_quota, emails_sent_today",
    )
    .eq("workspace_id", queue.workspace_id)
    .eq("is_active", true)
    .maybeSingle();
  if (!account) {
    result.errors.push("No connected Gmail");
    return result;
  }

  const remainingQuota = account.daily_quota - account.emails_sent_today;
  if (remainingQuota <= 0) return result;

  // Fetch follow-up template + attachments
  const { data: followupTemplate } = await admin
    .from("templates")
    .select("id, subject_lines, body_plain")
    .eq("id", queue.followup_template_id)
    .maybeSingle();
  if (!followupTemplate) {
    result.errors.push("Follow-up template not found");
    return result;
  }
  const { data: followupAttachments } = await admin
    .from("template_attachments")
    .select("filename, storage_path, mime_type")
    .eq("template_id", queue.followup_template_id);

  // Cutoff: sent at least followup_after_days ago
  const cutoff = new Date(
    Date.now() - queue.followup_after_days * 24 * 3600 * 1000,
  ).toISOString();

  // Find queue_recipients eligible for follow-up:
  // - status = 'sent' (not replied/bounced/skipped)
  // - sent more than followup_after_days ago
  // - linked to a campaign_recipient
  // - no existing followup_history entry
  const { data: candidates } = await admin
    .from("queue_recipients")
    .select(
      `id, contact_id, campaign_recipient_id, sent_at,
       contact:contacts!inner(id, email, first_name, last_name, company, position, status),
       campaign_recipient:campaign_recipients!inner(
         id, gmail_message_id, gmail_thread_id, gmail_subject_used, status
       )`,
    )
    .eq("queue_id", queueId)
    .eq("status", "sent")
    .lt("sent_at", cutoff)
    .not("campaign_recipient_id", "is", null)
    .limit(MAX_FOLLOWUPS_PER_RUN * 2); // fetch extra so we can filter

  if (!candidates || candidates.length === 0) return result;

  // Filter out those that already have a follow-up sent
  const campaignRecipientIds = candidates
    .map((c) => (c as { campaign_recipient_id: string }).campaign_recipient_id)
    .filter(Boolean);
  const { data: existingFollowups } = await admin
    .from("followup_history")
    .select("campaign_recipient_id")
    .in("campaign_recipient_id", campaignRecipientIds);
  const alreadyFollowedUp = new Set(
    (existingFollowups ?? []).map(
      (f) => (f as { campaign_recipient_id: string }).campaign_recipient_id,
    ),
  );

  const eligible = candidates
    .filter(
      (c) =>
        !alreadyFollowedUp.has(
          (c as { campaign_recipient_id: string }).campaign_recipient_id,
        ),
    )
    .slice(0, Math.min(MAX_FOLLOWUPS_PER_RUN, remainingQuota));

  // Workspace meta for AI opener
  let workspaceMeta: { name: string; business_type: string | null } | null =
    null;
  if (queue.use_ai_opener) {
    const { data: ws } = await admin
      .from("workspaces")
      .select("name, business_type")
      .eq("id", queue.workspace_id)
      .maybeSingle();
    workspaceMeta = ws ?? null;
  }

  let accountSentToday = account.emails_sent_today;

  for (const candidate of eligible) {
    result.attempted++;
    const c = candidate as unknown as {
      id: string;
      contact_id: string;
      campaign_recipient_id: string;
      contact: {
        id: string;
        email: string;
        first_name: string | null;
        last_name: string | null;
        company: string | null;
        position: string | null;
        status: string;
      } | Array<{
        id: string;
        email: string;
        first_name: string | null;
        last_name: string | null;
        company: string | null;
        position: string | null;
        status: string;
      }>;
      campaign_recipient: {
        id: string;
        gmail_message_id: string | null;
        gmail_thread_id: string | null;
        gmail_subject_used: string | null;
        status: string;
      } | Array<{
        id: string;
        gmail_message_id: string | null;
        gmail_thread_id: string | null;
        gmail_subject_used: string | null;
        status: string;
      }>;
    };

    const contact = Array.isArray(c.contact) ? c.contact[0] : c.contact;
    const cr = Array.isArray(c.campaign_recipient)
      ? c.campaign_recipient[0]
      : c.campaign_recipient;
    if (!contact || !cr) continue;
    if (contact.status !== "active") continue;
    if (cr.status === "replied") continue;

    // Resolve AI opener for follow-up — use cached or generate fresh
    let aiOpener: string | null = null;
    if (queue.use_ai_opener && workspaceMeta) {
      const { data: cached } = await admin
        .from("contact_workspace_data")
        .select("ai_opener")
        .eq("contact_id", contact.id)
        .eq("workspace_id", queue.workspace_id)
        .maybeSingle();
      aiOpener = (cached as { ai_opener?: string | null } | null)?.ai_opener ?? null;
      if (!aiOpener) {
        aiOpener = await generateOpener({
          workspace_name: workspaceMeta.name,
          workspace_business_type: workspaceMeta.business_type,
          contact_first_name: contact.first_name,
          contact_company: contact.company,
          contact_position: contact.position,
        });
      }
    }

    // Pre-create new campaign_recipient for the follow-up (not the original)
    const { data: followupCR } = await admin
      .from("campaign_recipients")
      .insert({
        campaign_id: null,
        contact_id: contact.id,
        user_id: queue.user_id,
        workspace_id: queue.workspace_id,
        contact_email: contact.email,
        status: "sending",
        gmail_thread_id: cr.gmail_thread_id, // thread the same convo
      })
      .select("id")
      .maybeSingle();

    const trackingUrl = followupCR?.id
      ? `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/track/open/${followupCR.id}`
      : null;

    const sendResult = await sendEmail(admin, {
      account: account as EmailAccount,
      contact,
      template: followupTemplate,
      attachments: followupAttachments ?? [],
      aiOpener,
      trackingUrl,
      gmailThreadId: cr.gmail_thread_id,
      inReplyToMessageId: cr.gmail_message_id,
      subjectPrefix: "Re:",
      forcedSubject: cr.gmail_subject_used, // reuse original subject (Re: ...)
    });

    if (!sendResult.ok) {
      result.failed++;
      result.errors.push(`${contact.email}: ${sendResult.error}`);
      if (followupCR?.id) {
        await admin
          .from("campaign_recipients")
          .update({
            status: "failed",
            failed_at: new Date().toISOString(),
            error_message: sendResult.error,
          })
          .eq("id", followupCR.id);
      }
      continue;
    }

    // Mark new CR sent + log followup_history
    if (followupCR?.id) {
      await admin
        .from("campaign_recipients")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          gmail_message_id: sendResult.gmail_message_id,
          gmail_subject_used: sendResult.subject_used,
        })
        .eq("id", followupCR.id);
    }

    await admin.from("followup_history").insert({
      campaign_recipient_id: cr.id, // points at ORIGINAL CR for grouping
      user_id: queue.user_id,
      followup_step: 1,
      template_id: queue.followup_template_id,
      gmail_message_id: sendResult.gmail_message_id,
    });

    accountSentToday++;
    await admin
      .from("email_accounts")
      .update({
        emails_sent_today: accountSentToday,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", account.id);

    await admin.from("activity_log").insert({
      user_id: queue.user_id,
      workspace_id: queue.workspace_id,
      activity_type: "followup_sent",
      entity_type: "queue_recipient",
      entity_id: c.id,
      metadata: { contact_email: contact.email, step: 1 },
    });

    result.sent++;
  }

  return result;
}
