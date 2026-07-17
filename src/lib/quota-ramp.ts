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
