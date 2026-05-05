import { notFound } from "next/navigation";
import Link from "next/link";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { getQueueById, getQueueStats } from "@/lib/queues";
import { createClient } from "@/lib/supabase/server";
import {
  formatDays,
  formatTime,
  progressPercent,
} from "@/lib/queue-helpers";
import { QueueActionsBar } from "./queue-actions-bar";

export default async function QueueDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();

  const queue = await getQueueById(id);
  if (!queue) notFound();

  const stats = await getQueueStats(id);
  const pct = progressPercent(queue);

  // Fetch template name
  const supabase = await createClient();
  const { data: template } = queue.template_id
    ? await supabase
        .from("templates")
        .select("name")
        .eq("id", queue.template_id)
        .maybeSingle()
    : { data: null };

  // Fetch connected Gmail account info
  const { data: account } = await supabase
    .from("email_accounts")
    .select("email, daily_quota, emails_sent_today")
    .eq("workspace_id", workspace.id)
    .eq("is_active", true)
    .maybeSingle();

  const remainingQuota = account ? account.daily_quota - account.emails_sent_today : 0;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link
        href={`/w/${slug}/queues`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        ← Back to queues
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                queue.is_active ? "bg-emerald-500" : "bg-zinc-400"
              }`}
            />
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              {queue.name}
            </h1>
            {!queue.is_active && (
              <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                Paused
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Template: {template?.name ?? "—"} ·{" "}
            {formatDays(queue.schedule_days)} ·{" "}
            {formatTime(queue.schedule_start_time)} – {formatTime(queue.schedule_end_time)} WIB ·{" "}
            {queue.daily_target}/hari
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between text-sm">
          <p className="font-medium text-zinc-900 dark:text-zinc-100">
            Progress
          </p>
          <p className="text-zinc-600 dark:text-zinc-400">
            {queue.total_sent} / {queue.total_in_queue} sent ({pct}%)
          </p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <Stat label="Pending" value={stats.pending.toLocaleString("id-ID")} />
          <Stat label="Sent" value={stats.sent.toLocaleString("id-ID")} color="emerald" />
          <Stat label="Replied" value={stats.replied.toLocaleString("id-ID")} color="blue" />
          <Stat label="Skipped/Bounced" value={(stats.skipped + stats.bounced).toLocaleString("id-ID")} />
        </div>
      </div>

      {/* Today's quota */}
      <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Today's Gmail quota
        </p>
        {account ? (
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            <strong>{account.email}</strong>:{" "}
            {account.emails_sent_today} / {account.daily_quota} sent today ·{" "}
            {remainingQuota} remaining
          </p>
        ) : (
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
            ⚠ Belum ada Gmail terhubung. Connect Gmail di{" "}
            <Link href={`/w/${slug}/settings`} className="underline">Settings</Link> sebelum kirim.
          </p>
        )}
      </div>

      {/* Actions */}
      <QueueActionsBar
        slug={slug}
        queueId={queue.id}
        isActive={queue.is_active}
        canSend={!!account && remainingQuota > 0 && stats.pending > 0}
        pendingCount={stats.pending}
      />

      {/* Settings detail */}
      <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Settings
        </h3>
        <dl className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          <DetailRow
            label="AI personalization"
            value={queue.use_ai_opener ? "On (Fase 7 pending)" : "Off"}
          />
          <DetailRow
            label="Auto follow-up"
            value={
              queue.followup_enabled
                ? `${queue.followup_after_days} hari`
                : "Off"
            }
          />
          <DetailRow
            label="Created"
            value={new Date(queue.created_at).toLocaleString("id-ID")}
          />
          <DetailRow
            label="Last run"
            value={
              queue.last_run_at
                ? new Date(queue.last_run_at).toLocaleString("id-ID")
                : "—"
            }
          />
        </dl>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color = "zinc",
}: {
  label: string;
  value: string;
  color?: "zinc" | "emerald" | "blue";
}) {
  const colors = {
    zinc: "text-zinc-700 dark:text-zinc-300",
    emerald: "text-emerald-700 dark:text-emerald-400",
    blue: "text-blue-700 dark:text-blue-400",
  };
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold ${colors[color]}`}>{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-zinc-900 dark:text-zinc-100">{value}</dd>
    </div>
  );
}
