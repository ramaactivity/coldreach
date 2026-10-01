import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, type EmailAccount } from "@/lib/email-sender";
import { generateOpener } from "@/lib/ai-opener";
import { effectiveWarmupQuota } from "@/lib/warmup";
import type { FollowupStep } from "@/lib/queue-helpers";
import { ensureDailyQuotaFresh, startOfTodayWibIso } from "@/lib/quota-reset";
import type { SignatureData } from "@/lib/signature";
import { followupDueAt } from "@/lib/ooo";
import { senderScope } from "@/lib/sender-account";

export type FollowupRunResult = {
  queue_id: string;
  attempted: number;
  sent: number;
  failed: number;
  errors: string[];
  by_step: Record<number, number>; // step → sent count
};

const MAX_FOLLOWUPS_PER_RUN = 10;
const DEDUP_COOLDOWN_DAYS = 3;
// Only follow up on first-touch emails sent within this window. Reply
// detection looks back 30 days, so anything older might already have a reply
// we never saw — and a "following up" on a months-old email reads as spam.
// Recipients whose auto-reply deferred the follow-up are exempt (see ooo_until).
// 28, not 21: the sequence runs to day 16 (4 → +5 → +7) and quota/OOO can
// push the last step a week later.
const FOLLOWUP_MAX_AGE_DAYS = 28;
// Follow-ups may use at most this share of the account's daily quota, so new
// first-touch outreach never stalls behind the follow-up backlog.
const FOLLOWUP_QUOTA_SHARE = 0.5;
const PAGE_SIZE = 1000;

function dedupCutoffIso(): string {
  return new Date(
    Date.now() - DEDUP_COOLDOWN_DAYS * 24 * 3600 * 1000,
  ).toISOString();
}

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
    archived_at: string | null;
    unsubscribe_token: string;
    language_pref: string | null;
  };
  cr: {
    id: string;
    gmail_message_id: string | null;
    gmail_thread_id: string | null;
    gmail_subject_used: string | null;
    status: string;
    ooo_until: string | null;
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

  // Connected account — possibly borrowed from another workspace, in which
  // case the 50% follow-up share is counted across every workspace using it.
  const sender = await senderScope(admin, queue.workspace_id);
  const { data: account } = await admin
    .from("email_accounts")
    .select(
      "id, email, display_name, access_token_encrypted, refresh_token_encrypted, token_expires_at, provider, smtp_config, is_active, daily_quota, emails_sent_today, quota_reset_at, warmup_mode, warmup_started_at",
    )
    .eq("workspace_id", sender.accountWorkspaceId)
    .eq("is_active", true)
    .maybeSingle();
  if (!account) {
    result.errors.push("No connected Gmail");
    return result;
  }
  // Self-heal stale daily counter (pg_cron reset is best-effort backup).
  const freshSentToday = await ensureDailyQuotaFresh(admin, {
    id: account.id,
    emails_sent_today: account.emails_sent_today,
    quota_reset_at:
      (account as { quota_reset_at?: string | null }).quota_reset_at ?? null,
  });
  account.emails_sent_today = freshSentToday;

  const effectiveDailyQuota = effectiveWarmupQuota({
    warmupMode: (account as { warmup_mode?: boolean }).warmup_mode ?? false,
    warmupStartedAt:
      (account as { warmup_started_at?: string | null }).warmup_started_at ??
      null,
    fallbackQuota: account.daily_quota,
  });
  // Follow-ups already sent today from this account (followup_history has
  // no workspace column — go through the recipient row).
  const { count: followupsToday } = await admin
    .from("followup_history")
    .select("id, campaign_recipients!inner(workspace_id)", {
      count: "exact",
      head: true,
    })
    .in("campaign_recipients.workspace_id", sender.sharingIds)
    .gte("sent_at", startOfTodayWibIso());
  const remainingQuota = Math.min(
    effectiveDailyQuota - account.emails_sent_today,
    Math.floor(effectiveDailyQuota * FOLLOWUP_QUOTA_SHARE) - (followupsToday ?? 0),
  );
  if (remainingQuota <= 0) return result;

  // Pre-fetch templates referenced by steps
  const templateIds = Array.from(new Set(steps.map((s) => s.template_id)));
  const { data: templates } = await admin
    .from("templates")
    .select("id, subject_lines, body_plain, body_plain_en")
    .in("id", templateIds);
  const templateById = new Map(
    (templates ?? []).map((t) => [t.id as string, t as unknown as {
      id: string;
      subject_lines: string[];
      body_plain: string;
      body_plain_en: string | null;
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
  // Two slices: recent first-touches, plus older ones held back by an
  // out-of-office reply. Paged because PostgREST caps a response at 1000 rows
  // and a busy queue sends more than that inside the window.
  const selectCols = `id, contact_id, campaign_recipient_id, sent_at,
       contact:contacts!inner(id, email, first_name, last_name, company, position, status, archived_at, unsubscribe_token, language_pref),
       campaign_recipient:campaign_recipients!inner(
         id, gmail_message_id, gmail_thread_id, gmail_subject_used, status, ooo_until
       )`;
  const ageCutoffIso = new Date(
    Date.now() - FOLLOWUP_MAX_AGE_DAYS * 24 * 3600 * 1000,
  ).toISOString();
  const rawRecipients: unknown[] = [];
  const seenQr = new Set<string>();
  for (const slice of ["recent", "ooo"] as const) {
    for (let from = 0; ; from += PAGE_SIZE) {
      let query = admin
        .from("queue_recipients")
        .select(selectCols)
        .eq("queue_id", queueId)
        .eq("status", "sent")
        .not("campaign_recipient_id", "is", null)
        .not("sent_at", "is", null);
      query =
        slice === "recent"
          ? query.gte("sent_at", ageCutoffIso)
          : query
              .lt("sent_at", ageCutoffIso)
              .gte("campaign_recipient.ooo_until", ageCutoffIso.slice(0, 10));
      const { data: page, error: pageErr } = await query
        .order("id")
        .range(from, from + PAGE_SIZE - 1);
      if (pageErr) {
        result.errors.push(`queue_recipients read failed: ${pageErr.message}`);
        return result;
      }
      for (const row of page ?? []) {
        const id = (row as { id: string }).id;
        if (!seenQr.has(id)) {
          seenQr.add(id);
          rawRecipients.push(row);
        }
      }
      if (!page || page.length < PAGE_SIZE) break;
    }
  }

  const allRecipients = rawRecipients as unknown as Array<{
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
  const { data: history, error: historyErr } = await admin
    .from("followup_history")
    .select("campaign_recipient_id, followup_step, sent_at")
    .in("campaign_recipient_id", crIds);
  // If this read fails we CANNOT tell which contacts already got which step —
  // proceeding would treat everyone as "never followed up" and re-blast step 1.
  // Abort the run instead; the next tick retries.
  if (historyErr) {
    result.errors.push(`followup_history read failed: ${historyErr.message}`);
    return result;
  }

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
    // Skip contacts the user or the bounce/stale archiver has shelved —
    // archived_at is set independently of `status`, so status alone misses them.
    if (contact.archived_at) continue;
    if (cr.status === "replied" || cr.status === "bounced") continue;

    const hist = historyByCR.get(r.campaign_recipient_id);
    const currentStep = hist?.highestStep ?? 0;
    if (currentStep >= steps.length) continue; // sequence done
    const nextIdx = currentStep; // 0-based index
    const stepCfg = steps[nextIdx];
    if (!stepCfg?.template_id) continue;

    const referenceTimeIso = hist?.lastSentAt ?? r.sent_at;
    if (!referenceTimeIso) continue;
    // Held until the day after an out-of-office recipient is back.
    const eligibleAt = followupDueAt(
      referenceTimeIso,
      stepCfg.after_days,
      cr.ooo_until,
    );
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

  // Cap at min(MAX_FOLLOWUPS_PER_RUN, remainingQuota). Freshest-due first:
  // a follow-up lands best a few days after the first email; oldest-first
  // would spend the daily share on emails about to age out of the window.
  candidates.sort(
    (a, b) =>
      new Date(b.reference_time).getTime() -
      new Date(a.reference_time).getTime(),
  );
  const eligibleRaw = candidates.slice(
    0,
    Math.min(MAX_FOLLOWUPS_PER_RUN, remainingQuota),
  );

  // Cross-workspace daily dedup: skip any contact_email that already
  // received (or is mid-receiving) an email today from any of this user's
  // workspaces.
  const eligibleEmailsLower = eligibleRaw.map((c) =>
    c.contact_email.toLowerCase(),
  );
  const dedupedEmails = new Set<string>();
  // Permanently bounced emails — never follow-up again.
  const bouncedEmails = new Set<string>();
  if (eligibleEmailsLower.length > 0) {
    const [alreadySentRes, bouncedRes] = await Promise.all([
      admin
        .from("campaign_recipients")
        .select("contact_email")
        .eq("user_id", queue.user_id)
        .gte("created_at", dedupCutoffIso())
        .in("status", ["sending", "sent", "opened", "replied"])
        .in("contact_email", eligibleEmailsLower),
      // PERMANENT bounce suppression: any email that has EVER bounced
      // under this user must never receive a follow-up.
      admin
        .from("campaign_recipients")
        .select("contact_email")
        .eq("user_id", queue.user_id)
        .eq("status", "bounced")
        .in("contact_email", eligibleEmailsLower),
    ]);
    for (const row of alreadySentRes.data ?? []) {
      const e = (row as { contact_email: string | null }).contact_email;
      if (e) dedupedEmails.add(e.toLowerCase());
    }
    for (const row of bouncedRes.data ?? []) {
      const e = (row as { contact_email: string | null }).contact_email;
      if (e) bouncedEmails.add(e.toLowerCase());
    }
  }
  const eligible = eligibleRaw.filter(
    (c) =>
      !dedupedEmails.has(c.contact_email.toLowerCase()) &&
      !bouncedEmails.has(c.contact_email.toLowerCase()),
  );

  // Workspace meta for AI opener + structured signature + brand color
  let workspaceMeta: { name: string; business_type: string | null } | null =
    null;
  let workspaceSignatureData: SignatureData | null = null;
  let workspaceColorTheme: string | null = null;
  {
    const { data: ws } = await admin
      .from("workspaces")
      .select("name, business_type, signature_data, color_theme")
      .eq("id", queue.workspace_id)
      .maybeSingle();
    if (ws) {
      if (queue.use_ai_opener) {
        workspaceMeta = { name: ws.name, business_type: ws.business_type };
      }
      workspaceSignatureData =
        (ws as { signature_data: SignatureData | null }).signature_data ?? null;
      workspaceColorTheme =
        (ws as { color_theme: string | null }).color_theme ?? null;
    }
  }

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

    // Indonesian unless the contact is explicitly marked English. Guessing
    // from the domain sent English to every .com (Pertamina, Erajaya…) and
    // English emails got ~20% fewer replies per send than Indonesian ones.
    const language = c.contact.language_pref === "en" ? "en" : "id";

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
        aiOpener = await generateOpener(
          {
            workspace_name: workspaceMeta.name,
            workspace_business_type: workspaceMeta.business_type,
            contact_first_name: c.contact.first_name,
            contact_company: c.contact.company,
            contact_position: c.contact.position,
          },
          language,
        );
      }
    }

    // Pre-create new campaign_recipient for this follow-up. If the insert
    // fails, DON'T send: a send with no CR row is invisible to dedup, stats,
    // and reply detection (queue-runner guards this the same way).
    const { data: followupCR, error: followupCRErr } = await admin
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
    if (followupCRErr || !followupCR?.id) {
      result.failed++;
      result.errors.push(
        `${c.contact.email}: campaign_recipient insert failed${
          followupCRErr ? ` — ${followupCRErr.message}` : ""
        }`,
      );
      continue;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const trackingUrl = followupCR?.id
      ? `${appUrl}/api/track/open/${followupCR.id}`
      : null;
    const clickTrackingBase = followupCR?.id
      ? `${appUrl}/api/track/click/${followupCR.id}`
      : null;
    const unsubscribeUrl = c.contact.unsubscribe_token
      ? `${appUrl}/unsubscribe/${c.contact.unsubscribe_token}`
      : null;

    const sendResult = await sendEmail(admin, {
      account: account as EmailAccount,
      contact: c.contact,
      template: tmpl,
      attachments: tmplAttachments,
      aiOpener,
      trackingUrl,
      clickTrackingBase,
      gmailThreadId: c.cr.gmail_thread_id,
      inReplyToMessageId: c.cr.gmail_message_id,
      subjectPrefix: "Re:",
      forcedSubject: c.cr.gmail_subject_used,
      signatureData: workspaceSignatureData,
      signatureFallbackColor: workspaceColorTheme,
      unsubscribeUrl,
      language,
      coldMode: (queue as { cold_mode?: boolean }).cold_mode ?? true,
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

    // Atomic quota increment (conditional-reset-then-+1 in one SQL statement)
    // so this hourly cron can't lose updates against the 30-min queue cron or
    // a concurrent Run Now writing the same account counter.
    await admin.rpc("bump_emails_sent", {
      p_account_id: account.id,
      p_delta: 1,
      p_day_start: startOfTodayWibIso(),
    });

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
