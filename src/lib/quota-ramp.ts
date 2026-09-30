import type { SupabaseClient } from "@supabase/supabase-js";
import { effectiveWarmupQuota } from "./warmup";

// Auto quota ramp — melanjutkan kurva warmup setelah warmup selesai. Bukannya
// stuck di daily_quota yang di-set manual, target harian naik pelan (+10/hari
// kerja) sampai RAMP_MAX, selama akunnya terbukti sehat DAN volumenya memang
// kepakai. Cron memanggil ini 23:00 WIB (window kirim tutup 17:00, reset
// counter 00:00) sehingga emails_sent_today = utilisasi penuh hari itu.
export const RAMP_STEP = 10;
export const RAMP_MAX = 500;

// Naik hanya kalau >= 80% quota efektif hari itu benar-benar terkirim —
// menaikkan ceiling yang gak pernah disentuh cuma memperbesar blast radius
// kalau suatu saat listnya jelek.
const UTILIZATION_MIN = 0.8;

// Rem deliverability: bounce 7 hari terakhir per workspace. Di atas 4%
// (ambang "mulai bahaya" Gmail ~2-5%) ramp berhenti sampai listnya sehat lagi.
const BOUNCE_WINDOW_DAYS = 7;
const BOUNCE_RATE_MAX = 0.04;
// Di bawah sample ini bounce rate terlalu noisy untuk dijadikan rem.
const BOUNCE_MIN_SAMPLE = 50;

export type RampOutcome = {
  email: string;
  from: number;
  to: number | null;
  skipped: string | null;
};

export async function runQuotaRamp(
  admin: SupabaseClient,
): Promise<{ ramped: number; outcomes: RampOutcome[] }> {
  const { data: accounts } = await admin
    .from("email_accounts")
    .select(
      "id, email, workspace_id, daily_quota, emails_sent_today, warmup_mode, warmup_started_at, health_status",
    )
    .eq("is_active", true)
    .eq("auto_ramp_enabled", true);

  const outcomes: RampOutcome[] = [];
  let ramped = 0;

  for (const a of accounts ?? []) {
    const skip = (reason: string) =>
      outcomes.push({ email: a.email, from: a.daily_quota, to: null, skipped: reason });

    if (!a.workspace_id) {
      skip("no_workspace");
      continue;
    }
    if (a.health_status !== "healthy") {
      skip("unhealthy");
      continue;
    }
    if (a.daily_quota >= RAMP_MAX) {
      skip("at_max");
      continue;
    }

    const effectiveCap = effectiveWarmupQuota({
      warmupMode: a.warmup_mode,
      warmupStartedAt: a.warmup_started_at,
      fallbackQuota: a.daily_quota,
    });
    if (effectiveCap < a.daily_quota) {
      skip("warmup_capped");
      continue;
    }

    if (a.emails_sent_today < Math.ceil(effectiveCap * UTILIZATION_MIN)) {
      skip("underutilized");
      continue;
    }

    const bounceCutoff = new Date(
      Date.now() - BOUNCE_WINDOW_DAYS * 24 * 3600 * 1000,
    ).toISOString();
    const [{ count: sent7 }, { count: bounced7 }] = await Promise.all([
      admin
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", a.workspace_id)
        .gte("sent_at", bounceCutoff),
      admin
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", a.workspace_id)
        .gte("bounced_at", bounceCutoff),
    ]);
    if (
      (sent7 ?? 0) >= BOUNCE_MIN_SAMPLE &&
      (bounced7 ?? 0) / Math.max(1, sent7 ?? 0) > BOUNCE_RATE_MAX
    ) {
      skip("bounce_high");
      continue;
    }

    const newQuota = Math.min(a.daily_quota + RAMP_STEP, RAMP_MAX);

    // Mirror ke workspace + queue sama seperti updateGmailQuota di settings —
    // ketiganya harus lockstep, kalau enggak cron runner tetap pace ke
    // daily_target lama dan kenaikan quota gak pernah kepakai.
    await admin
      .from("email_accounts")
      .update({ daily_quota: newQuota })
      .eq("id", a.id);
    await admin
      .from("workspaces")
      .update({ daily_target: newQuota })
      .eq("id", a.workspace_id);
    await admin
      .from("send_queues")
      .update({ daily_target: newQuota })
      .eq("workspace_id", a.workspace_id)
      .eq("is_one_shot", false);

    outcomes.push({ email: a.email, from: a.daily_quota, to: newQuota, skipped: null });
    ramped += 1;
  }

  return { ramped, outcomes };
}

// ─── Audience graduation ────────────────────────────────────────────────────
// A queue on the "deliverable" audience (proven addresses only — used while a
// new sender domain builds reputation) moves to the full contact pool once its
// account has earned it, and falls back if bounces spike afterwards.
const GRADUATE_WINDOW_DAYS = 14;
const GRADUATE_MIN_SENT = 150;
const GRADUATE_MAX_BOUNCE = 0.02;
const REVERT_WINDOW_DAYS = 7;
const REVERT_MIN_SENT = 50;
const REVERT_MAX_BOUNCE = 0.05;

export type AudienceOutcome = {
  queue_id: string;
  action: "graduated" | "reverted";
  sent: number;
  bounced: number;
};

async function bounceStats(
  admin: SupabaseClient,
  workspaceId: string,
  days: number,
): Promise<{ sent: number; bounced: number }> {
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const [{ count: sent }, { count: bounced }] = await Promise.all([
    admin
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("sent_at", cutoff),
    admin
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("bounced_at", cutoff),
  ]);
  return { sent: sent ?? 0, bounced: bounced ?? 0 };
}

export async function runAudienceGraduation(
  admin: SupabaseClient,
): Promise<AudienceOutcome[]> {
  const { data: queues } = await admin
    .from("send_queues")
    .select("id, user_id, workspace_id, audience_filter")
    .eq("is_active", true);
  const outcomes: AudienceOutcome[] = [];

  for (const q of queues ?? []) {
    const audience = (q.audience_filter ?? {}) as Record<string, unknown>;
    const onProven = audience.type === "deliverable";
    const graduatedEarlier = audience.type !== "deliverable" && !!audience.graduated_from;
    if (!onProven && !graduatedEarlier) continue;

    const { data: account } = await admin
      .from("email_accounts")
      .select("daily_quota, warmup_mode, warmup_started_at, health_status")
      .eq("workspace_id", q.workspace_id)
      .eq("is_active", true)
      .maybeSingle();
    if (!account) continue;

    let next: Record<string, unknown> | null = null;
    let stats = { sent: 0, bounced: 0 };
    if (onProven) {
      const warmupDone =
        effectiveWarmupQuota({
          warmupMode: account.warmup_mode,
          warmupStartedAt: account.warmup_started_at,
          fallbackQuota: account.daily_quota,
        }) >= account.daily_quota;
      if (account.health_status !== "healthy" || !warmupDone) continue;
      stats = await bounceStats(admin, q.workspace_id, GRADUATE_WINDOW_DAYS);
      if (
        stats.sent >= GRADUATE_MIN_SENT &&
        stats.bounced / stats.sent < GRADUATE_MAX_BOUNCE
      ) {
        // Keep the old settings so a later revert restores them exactly. A
        // queue the bounce breaker demoted goes back to its original audience.
        const original = (audience.tripped_from as Record<string, unknown> | undefined) ?? { type: "all" };
        next = { ...original, graduated_from: audience, graduated_at: new Date().toISOString() };
      }
    } else {
      stats = await bounceStats(admin, q.workspace_id, REVERT_WINDOW_DAYS);
      if (
        stats.sent >= REVERT_MIN_SENT &&
        stats.bounced / stats.sent > REVERT_MAX_BOUNCE
      ) {
        next = audience.graduated_from as Record<string, unknown>;
      }
    }
    if (!next) continue;

    const action = onProven ? "graduated" : "reverted";
    await admin.from("send_queues").update({ audience_filter: next }).eq("id", q.id);
    await admin.from("activity_log").insert({
      user_id: q.user_id,
      workspace_id: q.workspace_id,
      activity_type: `queue_audience_${action}`,
      entity_type: "send_queue",
      entity_id: q.id,
      metadata: { sent: stats.sent, bounced: stats.bounced },
    });
    outcomes.push({ queue_id: q.id, action, ...stats });
  }
  return outcomes;
}

// ─── Bounce breaker ─────────────────────────────────────────────────────────
// Emergency brake, run after every bounce poll: a workspace whose sends today
// bounce at ≥15% (min 20 sends) has its queues moved to the proven-contacts
// audience at once instead of burning the domain for the rest of the day.
// runAudienceGraduation restores the original audience once bounces recover.
const BREAKER_MIN_SENT = 20;
const BREAKER_RATE = 0.15;

export async function runBounceBreaker(
  admin: SupabaseClient,
  todayStartIso: string,
): Promise<Array<{ queue_id: string; sent: number; bounced: number }>> {
  const { data: queues } = await admin
    .from("send_queues")
    .select("id, user_id, workspace_id, audience_filter")
    .eq("is_active", true);
  const tripped: Array<{ queue_id: string; sent: number; bounced: number }> = [];
  for (const q of queues ?? []) {
    const audience = (q.audience_filter ?? {}) as Record<string, unknown>;
    if (audience.type === "deliverable" || audience.type === "manual") continue;
    const [{ count: sent }, { count: bounced }] = await Promise.all([
      admin.from("campaign_recipients").select("id", { count: "exact", head: true })
        .eq("workspace_id", q.workspace_id).gte("sent_at", todayStartIso),
      admin.from("campaign_recipients").select("id", { count: "exact", head: true })
        .eq("workspace_id", q.workspace_id).gte("sent_at", todayStartIso).eq("status", "bounced"),
    ]);
    if ((sent ?? 0) < BREAKER_MIN_SENT || (bounced ?? 0) / (sent ?? 1) < BREAKER_RATE) continue;
    const original = { ...audience };
    delete original.graduated_from;
    delete original.graduated_at;
    await admin
      .from("send_queues")
      .update({ audience_filter: { type: "deliverable", tripped_from: original, tripped_at: new Date().toISOString() } })
      .eq("id", q.id);
    await admin.from("activity_log").insert({
      user_id: q.user_id,
      workspace_id: q.workspace_id,
      activity_type: "queue_bounce_breaker",
      entity_type: "send_queue",
      entity_id: q.id,
      metadata: { sent, bounced },
    });
    tripped.push({ queue_id: q.id, sent: sent ?? 0, bounced: bounced ?? 0 });
  }
  return tripped;
}
