import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Target,
  Sparkles,
  Mail,
  AlertCircle,
  Shield,
  Trophy,
} from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { getQueueById, getQueueStats } from "@/lib/queues";
import { createClient } from "@/lib/supabase/server";
import { ensureDailyQuotaFresh } from "@/lib/quota-reset";
import { formatDays, formatTime, progressPercent } from "@/lib/queue-helpers";
import { QueueActionsBar } from "./queue-actions-bar";
import { FollowupSequenceEditor } from "./followup-sequence-editor";
import { TemplatePoolEditor } from "./template-pool-editor";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { FollowupStep } from "@/lib/queue-helpers";

export default async function QueueDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;

  // Parallelize: workspace, queue, stats — all independent
  const [workspace, queue, stats] = await Promise.all([
    getWorkspaceBySlug(slug),
    getQueueById(id),
    getQueueStats(id),
  ]);
  if (!workspace) notFound();
  if (!queue) notFound();
  const pct = progressPercent(queue);

  // Now parallelize account + all-templates + per-template breakdown
  const supabase = await createClient();
  const [accountResult, allTemplatesResult, breakdownResult] =
    await Promise.all([
      supabase
        .from("email_accounts")
        .select("id, email, daily_quota, emails_sent_today, quota_reset_at")
        .eq("workspace_id", workspace.id)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("templates")
        .select("id, name")
        .eq("workspace_id", workspace.id)
        .is("deleted_at", null)
        .order("name"),
      supabase.rpc("get_queue_template_breakdown", { p_queue_id: id }),
    ]);
  const account = accountResult.data as
    | {
        id: string;
        email: string;
        daily_quota: number;
        emails_sent_today: number;
        quota_reset_at: string | null;
      }
    | null;
  if (account) {
    account.emails_sent_today = await ensureDailyQuotaFresh(supabase, account);
  }
  const allTemplates = (allTemplatesResult.data ?? []) as Array<{
    id: string;
    name: string;
  }>;
  const templateNameById = new Map(allTemplates.map((t) => [t.id, t.name]));

  // Effective template pool for this queue (new array, fallback to single).
  const queueTemplateIds: string[] =
    Array.isArray(queue.template_ids) && queue.template_ids.length > 0
      ? queue.template_ids
      : queue.template_id
        ? [queue.template_id]
        : [];
  const queueTemplates = queueTemplateIds.map((tid) => ({
    id: tid,
    name: templateNameById.get(tid) ?? "(template terhapus)",
  }));
  const primaryTemplateName = queueTemplates[0]?.name ?? null;

  // Per-template A/B breakdown.
  const breakdown = (
    (breakdownResult.data ?? []) as Array<{
      template_id: string;
      sent: number;
      opened: number;
      replied: number;
    }>
  )
    .map((r) => ({
      template_id: r.template_id,
      name: templateNameById.get(r.template_id) ?? "(template terhapus)",
      sent: r.sent,
      open_rate: r.sent > 0 ? r.opened / r.sent : 0,
      reply_rate: r.sent > 0 ? r.replied / r.sent : 0,
    }))
    .sort((a, b) => b.sent - a.sent);
  // Highlight the winner (best reply rate) only when there's something to
  // compare and at least one reply.
  const bestReplyId =
    breakdown.length > 1 && breakdown.some((r) => r.reply_rate > 0)
      ? breakdown.reduce((best, r) =>
          r.reply_rate > best.reply_rate ? r : best,
        ).template_id
      : null;

  // Resolve effective followup steps (prefer new array, fallback to legacy)
  let followupSteps: FollowupStep[] = Array.isArray(queue.followup_steps)
    ? (queue.followup_steps as FollowupStep[])
    : [];
  if (
    followupSteps.length === 0 &&
    queue.followup_enabled &&
    queue.followup_template_id
  ) {
    followupSteps = [
      {
        template_id: queue.followup_template_id,
        after_days: queue.followup_after_days ?? 4,
      },
    ];
  }

  const remainingQuota = account
    ? account.daily_quota - account.emails_sent_today
    : 0;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link
        href={`/w/${slug}/queues`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to queues
      </Link>

      {/* Test mode banner */}
      {queue.test_mode && account && (
        <div className="mb-4 flex items-start gap-3 overflow-hidden rounded-xl border border-blue-200/80 bg-gradient-to-br from-blue-50 to-indigo-50/60 p-4 dark:border-blue-900/50 dark:from-blue-950/30 dark:to-indigo-950/20">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
            <Shield className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
              Queue ini di Test Mode — semua email aman ke{" "}
              <strong>{account.email}</strong>
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-blue-800 dark:text-blue-300">
              Saat lu klik "Send", recipient asli di-override ke akun Gmail
              terhubung dengan subject{" "}
              <code className="rounded bg-blue-100 px-1 font-mono text-[10px] dark:bg-blue-900/50">
                [TEST]
              </code>
              . Cron auto-run di-skip — cuma manual "Run Now" yang trigger.
            </p>
          </div>
        </div>
      )}

      {/* Hero header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2.5">
            {queue.is_active ? (
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
            ) : (
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-zinc-400" />
            )}
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">
              {queue.name}
            </h1>
            {queue.test_mode && (
              <Badge variant="info" className="font-semibold uppercase tracking-wide">
                <Shield className="h-2.5 w-2.5" />
                Test Mode
              </Badge>
            )}
            {!queue.is_active && <Badge variant="secondary">Paused</Badge>}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
            {queueTemplates.length > 0 && (
              <span className="inline-flex flex-wrap items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Template:
                {queueTemplates.map((t) => (
                  <strong
                    key={t.id}
                    className="font-medium text-zinc-900 dark:text-zinc-100"
                  >
                    {t.name}
                  </strong>
                ))}
                {queueTemplates.length > 1 && (
                  <Badge variant="success">
                    {queueTemplates.length} · rotasi
                  </Badge>
                )}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDays(queue.schedule_days)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTime(queue.schedule_start_time)}–{formatTime(queue.schedule_end_time)} WIB
            </span>
            <span className="inline-flex items-center gap-1">
              <Target className="h-3 w-3" />
              {queue.daily_target}/hari
            </span>
          </div>
        </div>
      </div>

      {/* Progress card */}
      <Card className="overflow-hidden p-0">
        <div className="border-b border-zinc-100 p-5 dark:border-zinc-800">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Progress
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              <span className="text-base font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {queue.total_sent.toLocaleString("id-ID")}
              </span>
              <span className="mx-1">/</span>
              {queue.total_in_queue.toLocaleString("id-ID")} sent ({pct}%)
            </p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className={`h-full rounded-full transition-all ${
                queue.is_active
                  ? "bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500"
                  : "bg-zinc-400 dark:bg-zinc-600"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 divide-zinc-100 sm:grid-cols-4 sm:divide-x dark:divide-zinc-800">
          <MiniStat label="Pending" value={stats.pending} />
          <MiniStat label="Sent" value={stats.sent} accent="emerald" />
          <MiniStat label="Replied" value={stats.replied} accent="blue" />
          <MiniStat
            label="Skipped/Bounced"
            value={stats.skipped + stats.bounced}
          />
        </div>
      </Card>

      {/* Quota card */}
      <Card className="mt-4 p-5">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Today's Gmail quota
          </p>
        </div>
        {account ? (
          <div className="mt-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              <strong>{account.email}</strong>
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
              {account.emails_sent_today} / {account.daily_quota} sent today ·{" "}
              <span
                className={
                  remainingQuota === 0
                    ? "text-red-600 dark:text-red-400 font-medium"
                    : ""
                }
              >
                {remainingQuota} remaining
              </span>
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                style={{
                  width: `${Math.min(100, (account.emails_sent_today / Math.max(1, account.daily_quota)) * 100)}%`,
                }}
              />
            </div>
          </div>
        ) : (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-400">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Belum ada Gmail terhubung. Connect Gmail di{" "}
              <Link
                href={`/w/${slug}/settings`}
                className="font-medium underline hover:no-underline"
              >
                Settings
              </Link>{" "}
              sebelum kirim.
            </p>
          </div>
        )}
      </Card>

      {/* Actions */}
      <QueueActionsBar
        slug={slug}
        queueId={queue.id}
        isActive={queue.is_active}
        canSend={!!account && remainingQuota > 0 && stats.pending > 0}
        pendingCount={stats.pending}
        lastShuffledAt={queue.last_shuffled_at}
        lastRefilledAt={queue.last_refilled_at}
        audienceType={
          (queue.audience_filter as { type?: string } | null)?.type ?? "all"
        }
      />

      {/* Template pool (rotation) */}
      <div className="mt-4">
        <TemplatePoolEditor
          slug={slug}
          queueId={queue.id}
          templates={allTemplates}
          initialSelected={queueTemplateIds}
        />
      </div>

      {/* Per-template A/B breakdown */}
      {breakdown.length > 0 && (
        <Card className="mt-4 p-0">
          <div className="flex items-center gap-2 border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
            <Trophy className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Performa per template
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="px-5 py-2.5 font-semibold">Template</th>
                  <th className="px-3 py-2.5 text-right font-semibold">
                    Terkirim
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold">
                    Open rate
                  </th>
                  <th className="px-5 py-2.5 text-right font-semibold">
                    Reply rate
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {breakdown.map((r) => (
                  <tr key={r.template_id}>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5 font-medium text-zinc-900 dark:text-zinc-100">
                        {r.name}
                        {r.template_id === bestReplyId && (
                          <Badge variant="success">
                            <Trophy className="h-2.5 w-2.5" />
                            Terbaik
                          </Badge>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {r.sent.toLocaleString("id-ID")}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {Math.round(r.open_rate * 100)}%
                    </td>
                    <td
                      className={`px-5 py-3 text-right font-medium tabular-nums ${
                        r.template_id === bestReplyId
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      {Math.round(r.reply_rate * 100)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-2.5 text-[11px] text-zinc-400 dark:text-zinc-500">
            Atribusi per kiriman — angka mencerminkan template yang
            benar-benar dipakai tiap email.
          </p>
        </Card>
      )}

      {/* Follow-up sequence */}
      <div className="mt-4">
        <FollowupSequenceEditor
          slug={slug}
          queueId={queue.id}
          templates={allTemplates}
          initialSteps={followupSteps}
          primaryTemplateName={primaryTemplateName}
        />
      </div>

      {/* Settings */}
      <Card className="mt-4 p-0">
        <div className="border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Configuration
          </h3>
        </div>
        <dl className="grid grid-cols-1 divide-y divide-zinc-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 dark:divide-zinc-800">
          <DetailRow
            label="AI personalization"
            value={
              queue.use_ai_opener ? (
                <Badge variant="info">On</Badge>
              ) : (
                <Badge variant="secondary">Off</Badge>
              )
            }
          />
          <DetailRow
            label="Follow-up steps"
            value={
              followupSteps.length > 0 ? (
                <Badge variant="info">{followupSteps.length} step</Badge>
              ) : (
                <Badge variant="secondary">Off</Badge>
              )
            }
          />
          <DetailRow
            label="Created"
            value={
              <span className="text-xs text-zinc-700 dark:text-zinc-300">
                {new Date(queue.created_at).toLocaleString("id-ID", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            }
          />
          <DetailRow
            label="Last run"
            value={
              <span className="text-xs text-zinc-700 dark:text-zinc-300">
                {queue.last_run_at
                  ? new Date(queue.last_run_at).toLocaleString("id-ID", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "—"}
              </span>
            }
          />
        </dl>
      </Card>
    </div>
  );
}

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "emerald" | "blue";
}) {
  return (
    <div className="p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${
          accent === "emerald"
            ? "text-emerald-600 dark:text-emerald-400"
            : accent === "blue"
              ? "text-blue-600 dark:text-blue-400"
              : "text-zinc-900 dark:text-zinc-100"
        }`}
      >
        {value.toLocaleString("id-ID")}
      </p>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="px-5 py-3.5">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </dt>
      <dd className="mt-1.5">{value}</dd>
    </div>
  );
}
