import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, type EmailAccount } from "@/lib/email-sender";
import { generateOpener } from "@/lib/ai-opener";
import type { FollowupStep } from "@/lib/queue-helpers";

export type FollowupRunResult = {
  queue_id: string;
  attempted: number;
  sent: number;
  failed: number;
  errors: string[];
  by_step: Record<number, number>; // step → sent count
};

const MAX_FOLLOWUPS_PER_RUN = 10;

type Candidate = {
  qr_id: string;
  contact_id: string;
  cr_id: string;
  contact_email: string;
  contact: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    position: string | null;
    status: string;
  };
  cr: {
    id: string;
    gmail_message_id: string | null;
    gmail_thread_id: string | null;
    gmail_subject_used: string | null;
    status: string;
  };
  original_sent_at: string;
  next_step_index: number; // 0-based; matches followup_steps[index]
  reference_time: string; // last activity to count days from
};

function unwrap<T>(v: T | T[] | null): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v;
}

/**
 * Multi-step follow-up runner.
 * For each queue_recipient that's been sent (status='sent') and not replied,
 * determine the next pending follow-up step and fire it if its delay has
 * elapsed since the most recent prior send.
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
    by_step: {},
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

  // Resolve effective steps: prefer followup_steps; fallback to legacy fields
  let steps: FollowupStep[] = Array.isArray(queue.followup_steps)
    ? (queue.followup_steps as FollowupStep[])
    : [];
  if (steps.length === 0 && queue.followup_enabled && queue.followup_template_id) {
    steps = [
      {
        template_id: queue.followup_template_id,
        after_days: queue.followup_after_days ?? 4,
      },
    ];
  }
  if (steps.length === 0) return result;

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

  // Pre-fetch templates referenced by steps
  const templateIds = Array.from(new Set(steps.map((s) => s.template_id)));
  const { data: templates } = await admin
    .from("templates")
    .select("id, subject_lines, body_plain")
    .in("id", templateIds);
  const templateById = new Map(
    (templates ?? []).map((t) => [t.id as string, t as unknown as {
      id: string;
      subject_lines: string[];
      body_plain: string;
    }]),
  );

  const { data: allAttachments } = await admin
    .from("template_attachments")
    .select("template_id, filename, storage_path, mime_type")
    .in("template_id", templateIds);
  const attachmentsByTemplate = new Map<
    string,
    Array<{ filename: string; storage_path: string; mime_type: string }>
  >();
  for (const a of (allAttachments ?? []) as Array<{
    template_id: string;
    filename: string;
    storage_path: string;
    mime_type: string;
  }>) {
    const arr = attachmentsByTemplate.get(a.template_id) ?? [];
    arr.push({
      filename: a.filename,
      storage_path: a.storage_path,
      mime_type: a.mime_type,
    });
    attachmentsByTemplate.set(a.template_id, arr);
  }

  // Pull all queue_recipients for this queue with their candidate metadata
  const { data: rawRecipients } = await admin
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
    .not("campaign_recipient_id", "is", null)
    .not("sent_at", "is", null);

  const allRecipients = (rawRecipients ?? []) as unknown as Array<{
    id: string;
    contact_id: string;
    campaign_recipient_id: string;
    sent_at: string;
    contact: Candidate["contact"] | Candidate["contact"][];
    campaign_recipient: Candidate["cr"] | Candidate["cr"][];
  }>;

  if (allRecipients.length === 0) return result;

  // Pull all followup_history for these CRs
  const crIds = allRecipients
    .map((r) => r.campaign_recipient_id)
    .filter(Boolean);
  const { data: history } = await admin
    .from("followup_history")
    .select("campaign_recipient_id, followup_step, sent_at")
    .in("campaign_recipient_id", crIds);

  // Map: cr_id → highest step + last sent_at for that step
  const historyByCR = new Map<
    string,
    { highestStep: number; lastSentAt: string | null }
  >();
  for (const h of (history ?? []) as Array<{
    campaign_recipient_id: string;
    followup_step: number;
    sent_at: string | null;
  }>) {
    const existing = historyByCR.get(h.campaign_recipient_id);
    if (!existing || h.followup_step > existing.highestStep) {
      historyByCR.set(h.campaign_recipient_id, {
        highestStep: h.followup_step,
        lastSentAt: h.sent_at,
      });
    } else if (
      h.followup_step === existing.highestStep &&
      h.sent_at &&
      (!existing.lastSentAt || h.sent_at > existing.lastSentAt)
    ) {
      existing.lastSentAt = h.sent_at;
    }
  }

  const now = Date.now();

  // Compute eligible candidates with their target step
  const candidates: Candidate[] = [];
  for (const r of allRecipients) {
    const contact = unwrap(r.contact);
    const cr = unwrap(r.campaign_recipient);
    if (!contact || !cr) continue;
    if (contact.status !== "active") continue;
    if (cr.status === "replied" || cr.status === "bounced") continue;

    const hist = historyByCR.get(r.campaign_recipient_id);
    const currentStep = hist?.highestStep ?? 0;
    if (currentStep >= steps.length) continue; // sequence done
    const nextIdx = currentStep; // 0-based index
    const stepCfg = steps[nextIdx];
    if (!stepCfg?.template_id) continue;

    const referenceTimeIso = hist?.lastSentAt ?? r.sent_at;
    if (!referenceTimeIso) continue;
    const eligibleAt =
      new Date(referenceTimeIso).getTime() +
      stepCfg.after_days * 24 * 3600 * 1000;
    if (eligibleAt > now) continue;

    candidates.push({
      qr_id: r.id,
      contact_id: r.contact_id,
      cr_id: r.campaign_recipient_id,
      contact_email: contact.email,
      contact,
      cr,
      original_sent_at: r.sent_at,
      next_step_index: nextIdx,
      reference_time: referenceTimeIso,
    });
  }

  if (candidates.length === 0) return result;

  // Cap at min(MAX_FOLLOWUPS_PER_RUN, remainingQuota); prioritize older
  candidates.sort(
    (a, b) =>
      new Date(a.reference_time).getTime() -
      new Date(b.reference_time).getTime(),
  );
  const eligible = candidates.slice(
    0,
    Math.min(MAX_FOLLOWUPS_PER_RUN, remainingQuota),
  );

  // Workspace meta for AI opener (cached)
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

  for (const c of eligible) {
    result.attempted++;
    const stepCfg = steps[c.next_step_index];
    const stepNumber = c.next_step_index + 1;
    const tmpl = templateById.get(stepCfg.template_id);
    if (!tmpl) {
      result.errors.push(`${c.contact_email}: template missing for step ${stepNumber}`);
      result.failed++;
      continue;
    }
    const tmplAttachments = attachmentsByTemplate.get(stepCfg.template_id) ?? [];

    let aiOpener: string | null = null;
    if (queue.use_ai_opener && workspaceMeta) {
      const { data: cached } = await admin
        .from("contact_workspace_data")
        .select("ai_opener")
        .eq("contact_id", c.contact.id)
        .eq("workspace_id", queue.workspace_id)
        .maybeSingle();
      aiOpener =
        (cached as { ai_opener?: string | null } | null)?.ai_opener ?? null;
      if (!aiOpener) {
        aiOpener = await generateOpener({
          workspace_name: workspaceMeta.name,
          workspace_business_type: workspaceMeta.business_type,
          contact_first_name: c.contact.first_name,
          contact_company: c.contact.company,
          contact_position: c.contact.position,
        });
      }
    }

    // Pre-create new campaign_recipient for this follow-up
    const { data: followupCR } = await admin
      .from("campaign_recipients")
      .insert({
        campaign_id: null,
        contact_id: c.contact.id,
        user_id: queue.user_id,
        workspace_id: queue.workspace_id,
        contact_email: c.contact.email,
        status: "sending",
        gmail_thread_id: c.cr.gmail_thread_id,
      })
      .select("id")
      .maybeSingle();

    const trackingUrl = followupCR?.id
      ? `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/track/open/${followupCR.id}`
      : null;

    const sendResult = await sendEmail(admin, {
      account: account as EmailAccount,
      contact: c.contact,
      template: tmpl,
      attachments: tmplAttachments,
      aiOpener,
      trackingUrl,
      gmailThreadId: c.cr.gmail_thread_id,
      inReplyToMessageId: c.cr.gmail_message_id,
      subjectPrefix: "Re:",
      forcedSubject: c.cr.gmail_subject_used,
    });

    if (!sendResult.ok) {
      result.failed++;
      result.errors.push(`${c.contact.email}: ${sendResult.error}`);
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
      campaign_recipient_id: c.cr.id,
      user_id: queue.user_id,
      followup_step: stepNumber,
      template_id: stepCfg.template_id,
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
      entity_id: c.qr_id,
      metadata: {
        contact_email: c.contact.email,
        step: stepNumber,
        template_id: stepCfg.template_id,
      },
    });

    result.sent++;
    result.by_step[stepNumber] = (result.by_step[stepNumber] ?? 0) + 1;
  }

  return result;
}
