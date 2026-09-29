import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendEmail,
  type EmailAccount,
  type EmailTemplate,
} from "@/lib/email-sender";
import { generateOpener } from "@/lib/ai-opener";
import { effectiveWarmupQuota } from "@/lib/warmup";
import {
  corporateDomainOf,
} from "@/lib/lang-detect";
import { ensureDailyQuotaFresh, startOfTodayWibIso } from "@/lib/quota-reset";
import type { SignatureData } from "@/lib/signature";
import { wibDate } from "@/lib/ooo";

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

// Enterprise spam filters pattern-block senders that blast many near-identical
// emails into one company domain (we were doing 20–30 per domain per 14 days
// across four senders, with zero replies from every large-corporate domain).
// Caps count ALL of the user's workspaces — the gateway sees one campaign.
// Consumer webmail (gmail/yahoo/...) is exempt — see corporateDomainOf.
const MAX_PER_COMPANY_DOMAIN_PER_DAY = 2;
const MAX_PER_COMPANY_DOMAIN_PER_WINDOW = 8;
const DOMAIN_WINDOW_DAYS = 14;

// Cross-workspace person cooldown: once any workspace emails an address, no
// other workspace may cold-email it for this long (977 people got 2+ brands
// within 30 days before this). Contacts held back are deferred via
// queue_recipients.scheduled_for_date so they stop occupying candidate slots.
const DEDUP_COOLDOWN_DAYS = 45;
const DAY_MS = 24 * 3600 * 1000;

// Cutoff timestamp (UTC ISO) for the dedup window: now() minus N days.
function dedupCutoffIso(): string {
  return new Date(
    Date.now() - DEDUP_COOLDOWN_DAYS * 24 * 3600 * 1000,
  ).toISOString();
}

/**
 * Process up to `batchSize` pending recipients in a queue.
 * Used by manual "Run Now" and the cron job.
 *
 * `deadlineEpochMs` (optional) makes the send loop stop BEFORE the serverless
 * function's hard timeout instead of being killed mid-send — a kill orphans
 * the in-flight 'sending' row, which the cross-workspace dedup then treats as
 * sent and suppresses that contact for days. Unsent recipients stay 'pending'
 * and are picked up next tick.
 *
 * Uses admin client because cron has no auth user context.
 */
export async function runQueue(
  queueId: string,
  batchSize: number = DEFAULT_BATCH_SIZE,
  applyDelay: boolean = true,
  deadlineEpochMs: number | null = null,
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

  // Daily reshuffle. shuffle_key on queue_recipients is regenerated once
  // per WIB day so each day's batch picks a fresh random subset across
  // the whole pool (top / middle / bottom) instead of marching down the
  // creation-time shuffle. Cheap RPC — single UPDATE on pending rows.
  const wibTodayStart = startOfTodayWibIso();
  const lastShuffled = (queue as { last_shuffled_at?: string | null })
    .last_shuffled_at;
  const needsReshuffle = !lastShuffled || lastShuffled < wibTodayStart;

  // Effective template set. A queue may rotate across several templates
  // (balanced-random per send) or just use its single template_id. Older
  // queues have template_ids = NULL → fall back to [template_id].
  const queueTemplateIds = (queue as { template_ids?: string[] | null })
    .template_ids;
  const requestedTemplateIds =
    Array.isArray(queueTemplateIds) && queueTemplateIds.length > 0
      ? queueTemplateIds
      : queue.template_id
        ? [queue.template_id]
        : [];
  if (requestedTemplateIds.length === 0) {
    result.errors.push("Queue has no template");
    return result;
  }

  // Everything below is independent of everything else in this group, so it
  // goes out as ONE round of round trips instead of ten sequential ones. With
  // the DB in ap-southeast-1 the serial version burned ~10s of the tick's
  // budget before the first email even started rendering.
  const [
    accountRes,
    templateRes,
    attachmentRes,
    workspaceRes,
    pendingRes,
    ,
  ] = await Promise.all([
    admin
      .from("email_accounts")
      .select(
        "id, email, display_name, access_token_encrypted, refresh_token_encrypted, token_expires_at, provider, smtp_config, is_active, daily_quota, emails_sent_today, quota_reset_at, warmup_mode, warmup_started_at",
      )
      .eq("workspace_id", queue.workspace_id)
      .eq("is_active", true)
      .maybeSingle(),
    admin
      .from("templates")
      .select("id, category, subject_lines, subject_lines_en, body_plain, body_plain_en")
      .in("id", requestedTemplateIds),
    admin
      .from("template_attachments")
      .select("template_id, filename, storage_path, mime_type")
      .in("template_id", requestedTemplateIds),
    admin
      .from("workspaces")
      .select("name, business_type, signature_data, color_theme")
      .eq("id", queue.workspace_id)
      .maybeSingle(),
    admin
      .from("queue_recipients")
      .select("id", { count: "exact", head: true })
      .eq("queue_id", queueId)
      .eq("status", "pending"),
    // Daily reshuffle. shuffle_key on queue_recipients is regenerated once
    // per WIB day so each day's batch picks a fresh random subset across the
    // whole pool (top / middle / bottom) instead of marching down the
    // creation-time shuffle. Non-fatal: on failure the send proceeds with
    // yesterday's order rather than aborting.
    needsReshuffle
      ? admin
          .rpc("reshuffle_queue", { p_queue_id: queueId })
          .then(({ error }) => {
            if (error) console.error("reshuffle_queue rpc failed:", error);
          })
      : Promise.resolve(),
  ]);

  const account = accountRes.data;
  if (!account) {
    result.errors.push("No connected Gmail for this workspace");
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

  // Apply warmup ramp if active. Effective quota = min(account.daily_quota,
  // ramp-stage cap). Once we strip warmup_mode the cap goes back to the
  // raw daily_quota.
  const effectiveDailyQuota = effectiveWarmupQuota({
    warmupMode: (account as { warmup_mode?: boolean }).warmup_mode ?? false,
    warmupStartedAt:
      (account as { warmup_started_at?: string | null }).warmup_started_at ??
      null,
    fallbackQuota: account.daily_quota,
  });
  const remainingQuota = effectiveDailyQuota - account.emails_sent_today;
  if (remainingQuota <= 0) {
    result.errors.push(
      effectiveDailyQuota < account.daily_quota
        ? `Warmup cap reached (${effectiveDailyQuota}/day)`
        : "Daily quota exhausted",
    );
    return result;
  }

  const templateRows = templateRes.data;
  const templateMap = new Map<string, EmailTemplate>();
  for (const t of (templateRows ?? []) as Array<EmailTemplate & { category: string | null }>) {
    // A follow-up ("Menyambung email saya sebelumnya…") must never go out as
    // the first email — they belong in followup_steps, not the rotation.
    if (t.category === "follow-up") continue;
    templateMap.set(t.id, t);
  }
  // Keep only ids that resolved, preserving the queue's order (stable
  // tiebreak for the balanced rotation below).
  const activeTemplateIds = requestedTemplateIds.filter((id) =>
    templateMap.has(id),
  );
  if (activeTemplateIds.length === 0) {
    result.errors.push("Template not found");
    return result;
  }

  // Attachments are per-template — fetch the whole set, grouped by template.
  type AttachmentRow = {
    template_id: string;
    filename: string;
    storage_path: string;
    mime_type: string;
  };
  const attachmentRows = attachmentRes.data;
  const attachmentsByTemplate = new Map<
    string,
    Array<{ filename: string; storage_path: string; mime_type: string }>
  >();
  for (const a of (attachmentRows ?? []) as AttachmentRow[]) {
    const list = attachmentsByTemplate.get(a.template_id) ?? [];
    list.push({
      filename: a.filename,
      storage_path: a.storage_path,
      mime_type: a.mime_type,
    });
    attachmentsByTemplate.set(a.template_id, list);
  }

  // Balanced rotation: seed per-template counts from this queue's real sent
  // history, then always pick the least-used template (incremented in-memory)
  // so volume stays even across templates over time → clean A/B/C testing.
  const templateUseCount = new Map<string, number>();
  for (const id of activeTemplateIds) templateUseCount.set(id, 0);
  if (activeTemplateIds.length > 1) {
    const { data: counts } = await admin.rpc("queue_template_send_counts", {
      p_queue_id: queueId,
    });
    for (const row of (counts ?? []) as Array<{
      template_id: string;
      cnt: number;
    }>) {
      if (templateUseCount.has(row.template_id)) {
        templateUseCount.set(row.template_id, row.cnt ?? 0);
      }
    }
  }
  // Least-used template; ties broken by the queue's order (deterministic
  // round-robin). Caller increments the count only after a successful send.
  function pickTemplateId(): string {
    let best = activeTemplateIds[0];
    let bestCount = templateUseCount.get(best) ?? 0;
    for (const id of activeTemplateIds) {
      const c = templateUseCount.get(id) ?? 0;
      if (c < bestCount) {
        best = id;
        bestCount = c;
      }
    }
    return best;
  }

  // Evergreen auto-refill. The counter on send_queues drifts, so this uses
  // the real pending count (fetched in the parallel group above) and tops up
  // when it dips below ~2 days of capacity.
  // Audience type 'manual' is a no-op inside the RPC (fixed list).
  {
    const pending = pendingRes.count ?? 0;
    const dailyTarget = queue.daily_target ?? 50;
    const refillThreshold = dailyTarget * 2;
    if (pending < refillThreshold) {
      const targetSize = dailyTarget * 7;
      const maxAdd = Math.max(0, targetSize - pending);
      if (maxAdd > 0) {
        const { error: refillErr } = await admin.rpc("refill_queue", {
          p_queue_id: queueId,
          p_max_add: maxAdd,
        });
        // Non-fatal: send proceeds with whatever pending is left rather
        // than aborting. Refill will retry on the next cron tick.
        if (refillErr) {
          console.error("refill_queue rpc failed:", refillErr);
        }
      }
    }
  }

  const limit = Math.min(batchSize, remainingQuota);
  // Oversample candidates: rows skipped by dedup or the per-domain cap must
  // not eat send slots — the loop below stops once `limit` actual
  // sends/failures have happened, not after `limit` rows examined.
  const candidateLimit = Math.min(limit * 4, 200);
  // Order by priority desc, then shuffle_key asc. shuffle_key is reshuffled
  // once per day (above), so today's pick is a fresh random subset of
  // pending rows — not a march down the creation-time order.
  const { data: recipients } = await admin
    .from("queue_recipients")
    .select(
      `id, priority,
       contact:contacts!inner(
         id, email, first_name, last_name, company, position, status,
         archived_at, unsubscribe_token, language_pref,
         total_emails_sent_all_workspaces
       )`,
    )
    .eq("queue_id", queueId)
    .eq("status", "pending")
    .or(`scheduled_for_date.is.null,scheduled_for_date.lte.${wibDate(Date.now())}`)
    .order("priority", { ascending: false })
    .order("shuffle_key", { ascending: true })
    .limit(candidateLimit);

  if (!recipients || recipients.length === 0) {
    return result;
  }

  // Workspace meta (fetched in the parallel group above) covers AI-opener
  // prompt context + structured signature + brand color fallback.
  let workspaceMeta: { name: string; business_type: string | null } | null =
    null;
  let workspaceSignatureData: SignatureData | null = null;
  let workspaceColorTheme: string | null = null;
  {
    const ws = workspaceRes.data;
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

  // Pre-fetch cached AI openers for all candidate contacts in this batch
  const candidateContactIds = recipients
    .map((r) => {
      const c = (r as { contact: unknown }).contact;
      if (Array.isArray(c)) return c[0]?.id;
      return (c as { id?: string } | null)?.id;
    })
    .filter((id): id is string => typeof id === "string");

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

  // These four are independent of each other — one round of round trips.
  const [openerRes, alreadySentRes, todayRowsRes, bouncedRes] = await Promise.all([
    queue.use_ai_opener && candidateContactIds.length > 0
      ? admin
          .from("contact_workspace_data")
          .select("contact_id, ai_opener")
          .eq("workspace_id", queue.workspace_id)
          .in("contact_id", candidateContactIds)
          .not("ai_opener", "is", null)
      : Promise.resolve({ data: null }),
    // Use created_at (always set) instead of sent_at (NULL for 'sending'
    // rows) so we also catch in-flight rows from a prior batch that timed
    // out mid-iteration.
    candidateEmailsLower.length > 0
      ? admin
          .from("campaign_recipients")
          .select("contact_email, created_at")
          .eq("user_id", queue.user_id)
          .gte("created_at", dedupCutoffIso())
          .in("status", ["sending", "sent", "opened", "replied"])
          .in("contact_email", candidateEmailsLower)
      : Promise.resolve({ data: null }),
    // Per-company-domain send counts across ALL workspaces (today + window)
    // for the candidate domains — feeds the domain caps.
    admin.rpc("domain_send_counts", {
      p_user_id: queue.user_id,
      p_domains: Array.from(
        new Set(
          candidateEmailsLower
            .map((e) => corporateDomainOf(e))
            .filter((d): d is string => !!d),
        ),
      ),
      p_today_start: wibTodayStart,
      p_window_start: new Date(
        Date.now() - DOMAIN_WINDOW_DAYS * DAY_MS,
      ).toISOString(),
    }),
    // PERMANENT bounce suppression (JS-level fast path): any email that has
    // EVER bounced under this user — across all workspaces, no time limit —
    // must never be sent again. The SQL claim_contact_send has the same
    // guard, but catching it here avoids the round-trip + advisory lock.
    candidateEmailsLower.length > 0
      ? admin
          .from("campaign_recipients")
          .select("contact_email")
          .eq("user_id", queue.user_id)
          .eq("status", "bounced")
          .in("contact_email", candidateEmailsLower)
      : Promise.resolve({ data: null }),
  ]);

  // Pre-fetched cached AI openers for the candidate contacts in this batch.
  const openerCache = new Map<string, string>();
  for (const row of openerRes.data ?? []) {
    const r = row as { contact_id: string; ai_opener: string | null };
    if (r.ai_opener) openerCache.set(r.contact_id, r.ai_opener);
  }

  // Permanently bounced emails — never send again, regardless of cooldown.
  const bouncedEmails = new Set<string>();
  for (const row of bouncedRes.data ?? []) {
    const e = (row as { contact_email: string | null }).contact_email;
    if (e) bouncedEmails.add(e.toLowerCase());
  }

  // Last time each candidate address was emailed by any workspace.
  const lastTouchedMs = new Map<string, number>();
  for (const row of alreadySentRes.data ?? []) {
    const r = row as { contact_email: string | null; created_at: string };
    if (!r.contact_email) continue;
    const e = r.contact_email.toLowerCase();
    const t = new Date(r.created_at).getTime();
    if (t > (lastTouchedMs.get(e) ?? 0)) lastTouchedMs.set(e, t);
  }

  const domainSentToday = new Map<string, number>();
  const domainSentWindow = new Map<string, number>();
  for (const row of (todayRowsRes.data ?? []) as Array<{
    domain: string;
    today: number;
    recent: number;
  }>) {
    domainSentToday.set(row.domain, row.today);
    domainSentWindow.set(row.domain, row.recent);
  }
  if (todayRowsRes.error) {
    // Without counts the caps can't be enforced — don't send blind.
    result.errors.push(`domain_send_counts: ${todayRowsRes.error.message}`);
    return result;
  }

  // Park a pending row until `days` from now so it stops taking candidate
  // slots on every tick while it is capped/cooling down.
  const deferRecipient = (id: string, untilMs: number) =>
    admin
      .from("queue_recipients")
      .update({ scheduled_for_date: wibDate(untilMs) })
      .eq("id", id);

  // Local view of how many recipients are still pending, used only for the
  // one-shot auto-deactivate check at the end. The persisted counters are
  // recomputed once per run by sync_queue_counters.
  let queuePending = queue.total_pending;

  for (let i = 0; i < recipients.length; i++) {
    // Stop cleanly before the function's hard timeout kills us mid-send.
    if (deadlineEpochMs !== null && Date.now() > deadlineEpochMs) {
      break;
    }
    // Candidates are oversampled (candidateLimit > limit) — stop once the
    // requested batch of real sends/attempts is done.
    if (result.sent + result.failed >= limit) {
      break;
    }
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
            archived_at: string | null;
            unsubscribe_token: string;
            language_pref: string | null;
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
            archived_at: string | null;
            unsubscribe_token: string;
            language_pref: string | null;
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
    // Skip if either the email-sending status went non-active OR the user /
    // bounce-detector has archived the contact since this queue was built.
    if (contact.status !== "active" || contact.archived_at) {
      await admin
        .from("queue_recipients")
        .update({ status: "skipped" })
        .eq("id", recipient.id);
      result.skipped++;
      continue;
    }

    // Cross-workspace cooldown: emailed by any workspace inside the window →
    // stay PENDING (not 'skipped', which would drop it from this queue
    // forever) but deferred to the day the window ends.
    const lastTouch = lastTouchedMs.get(contact.email.toLowerCase());
    if (lastTouch !== undefined) {
      await deferRecipient(recipient.id, lastTouch + DEDUP_COOLDOWN_DAYS * DAY_MS);
      result.skipped++;
      continue;
    }

    // PERMANENT bounce suppression: if this email has EVER bounced under
    // any workspace, mark the queue_recipient as 'skipped' (permanent —
    // unlike the dedup check which stays pending). A bounced address
    // doesn't un-bounce; re-sending only burns quota and damages
    // sender reputation across all connected Gmail accounts.
    if (bouncedEmails.has(contact.email.toLowerCase())) {
      await admin
        .from("queue_recipients")
        .update({ status: "skipped" })
        .eq("id", recipient.id);
      result.skipped++;
      continue;
    }

    // Per-company-domain daily cap. Leave PENDING (not 'skipped') so the
    // contact stays in the pool and becomes eligible again on a later day.
    const capDomain = corporateDomainOf(contact.email);
    if (capDomain) {
      if ((domainSentWindow.get(capDomain) ?? 0) >= MAX_PER_COMPANY_DOMAIN_PER_WINDOW) {
        await deferRecipient(recipient.id, Date.now() + 3 * DAY_MS);
        result.skipped++;
        continue;
      }
      if ((domainSentToday.get(capDomain) ?? 0) >= MAX_PER_COMPANY_DOMAIN_PER_DAY) {
        await deferRecipient(recipient.id, Date.now() + DAY_MS);
        result.skipped++;
        continue;
      }
    }

    // Indonesian unless the contact is explicitly marked English. Guessing
    // from the domain sent English to every .com (Pertamina, Erajaya…) and
    // English emails got ~20% fewer replies per send than Indonesian ones.
    const language = contact.language_pref === "en" ? "en" : "id";

    // Resolve AI opener: cache → generate → fallback null
    let aiOpener: string | null = null;
    if (queue.use_ai_opener && workspaceMeta) {
      aiOpener = openerCache.get(contact.id) ?? null;
      if (!aiOpener) {
        aiOpener = await generateOpener(
          {
            workspace_name: workspaceMeta.name,
            workspace_business_type: workspaceMeta.business_type,
            contact_first_name: contact.first_name,
            contact_company: contact.company,
            contact_position: contact.position,
          },
          language,
        );
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

    // Claim the address and pre-create its campaign_recipient row in ONE
    // atomic statement (see claim_contact_send). This replaces the old
    // re-check-then-insert pair: the batch-start dedup snapshot goes stale
    // the moment another runner sends, and all workspace queues now run
    // concurrently in the same tick. The RPC takes a per-address advisory
    // lock, so exactly one runner can win a given recipient.
    const { data: claimedId, error: claimError } = await admin.rpc(
      "claim_contact_send",
      {
        p_user_id: queue.user_id,
        p_workspace_id: queue.workspace_id,
        p_contact_id: contact.id,
        p_contact_email: contact.email,
        p_cutoff: dedupCutoffIso(),
      },
    );
    // Loud failure — earlier we silently swallowed this and ended up with
    // 0 campaign_recipients while emails were still going out via Gmail.
    if (claimError) {
      result.failed++;
      result.errors.push(
        `${contact.email}: claim failed — ${claimError.message}`,
      );
      continue;
    }
    if (!claimedId) {
      // Another runner already holds this address inside the dedup window.
      // Leave the queue_recipient PENDING so it retries once the window passes.
      lastTouchedMs.set(contact.email.toLowerCase(), Date.now());
      result.skipped++;
      continue;
    }
    const campaignRecipient = { id: claimedId as string };

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const trackingUrl = campaignRecipient?.id
      ? `${appUrl}/api/track/open/${campaignRecipient.id}`
      : null;
    const clickTrackingBase = campaignRecipient?.id
      ? `${appUrl}/api/track/click/${campaignRecipient.id}`
      : null;
    // Token-based public unsubscribe URL — no auth, idempotent.
    const unsubscribeUrl = contact.unsubscribe_token
      ? `${appUrl}/unsubscribe/${contact.unsubscribe_token}`
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

    // Balanced rotation: pick the least-used template for this send.
    const chosenTemplateId = pickTemplateId();
    const chosenTemplate = templateMap.get(chosenTemplateId)!;
    const chosenAttachments =
      attachmentsByTemplate.get(chosenTemplateId) ?? [];

    const sendResult = await sendEmail(admin, {
      account: account as EmailAccount,
      contact: testModeContact,
      template: chosenTemplate,
      attachments: chosenAttachments,
      aiOpener,
      trackingUrl,
      clickTrackingBase,
      subjectPrefix: queue.test_mode ? "[TEST]" : null,
      signatureData: workspaceSignatureData,
      signatureFallbackColor: workspaceColorTheme,
      unsubscribeUrl,
      language,
      // Plain-text personal-looking send for cold outreach (no pixel / link
      // rewrite / HTML). Defaults on; per-queue override via cold_mode.
      coldMode: (queue as { cold_mode?: boolean }).cold_mode ?? true,
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

    // Counter bookkeeping (in-memory; DB writes follow in parallel below).
    // emails_sent_today is bumped atomically via RPC below, not tracked here.
    queuePending = Math.max(0, queuePending - 1);
    // Count this template's send so the next pick stays balanced.
    templateUseCount.set(
      chosenTemplateId,
      (templateUseCount.get(chosenTemplateId) ?? 0) + 1,
    );
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
              subject_line_index:
                sendResult.subject_index >= 0
                  ? sendResult.subject_index
                  : null,
            })
            .eq("id", campaignRecipient.id)
        : Promise.resolve(),
      admin
        .from("queue_recipients")
        .update({
          status: "sent",
          sent_at: nowIso,
          campaign_recipient_id: campaignRecipient?.id ?? null,
          template_id: chosenTemplateId,
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
      // NOTE: send_queues counters are deliberately NOT written here. They
      // were one extra round trip on every single email, and
      // sync_queue_counters below recomputes all of them from the real rows
      // anyway — the per-send write was pure overhead on the hot path.
      // Atomic quota increment — a conditional-reset-then-+1 in a single SQL
      // statement so overlapping runners (queue cron + followup cron + Run Now)
      // can't lose updates the way an absolute write from a stale read would.
      admin.rpc("bump_emails_sent", {
        p_account_id: account.id,
        p_delta: 1,
        p_day_start: startOfTodayWibIso(),
      }),
    ]);

    // Track the just-sent email so dedup catches subsequent recipients in
    // the same batch (the DB query at batch start can't see this row yet).
    lastTouchedMs.set(contact.email.toLowerCase(), Date.now());
    if (capDomain) {
      domainSentToday.set(capDomain, (domainSentToday.get(capDomain) ?? 0) + 1);
      domainSentWindow.set(capDomain, (domainSentWindow.get(capDomain) ?? 0) + 1);
    }

    result.sent++;

    // Delay before next send (skip last)
    if (applyDelay && i < recipients.length - 1) {
      const delay = DELAY_MIN_MS + Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Truth-sync the cached counters from the real queue_recipients rows, and
  // stamp last_run_at once for the whole run. A single recompute converges
  // every counter back to reality (skips, archived contacts and external
  // inserts all drift the cache), so nothing downstream is ever misled by a
  // stale value. Both are non-fatal.
  {
    const [{ error: syncErr }] = await Promise.all([
      admin.rpc("sync_queue_counters", { p_queue_id: queueId }),
      admin
        .from("send_queues")
        .update({ last_run_at: new Date().toISOString() })
        .eq("id", queueId),
    ]);
    if (syncErr) {
      console.error("sync_queue_counters rpc failed:", syncErr);
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
