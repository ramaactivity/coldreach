import { notFound } from "next/navigation";
import Link from "next/link";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import {
  getWorkspaceStats,
  getRecentReplies,
  getRecentActivity,
} from "@/lib/stats";

export default async function WorkspaceDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();

  const [stats, replies, activity] = await Promise.all([
    getWorkspaceStats(workspace.id),
    getRecentReplies(workspace.id, 8),
    getRecentActivity(workspace.id, 10),
  ]);

  const formatTime = (t: string) => t.slice(0, 5);
  const replyRate =
    stats.sent_7d > 0 ? Math.round((stats.replied_7d / stats.sent_7d) * 100) : 0;
  const openRate =
    stats.sent_7d > 0 ? Math.round((stats.opened_7d / stats.sent_7d) * 100) : 0;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: workspace.color_theme }}
            />
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              {workspace.business_type}
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            {workspace.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Schedule: {formatTime(workspace.schedule_start_time)} – {formatTime(workspace.schedule_end_time)} WIB · {workspace.daily_target}/hari target
          </p>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          label="Sent today"
          value={stats.sent_today.toLocaleString("id-ID")}
          hint={
            stats.quota_today
              ? `${stats.quota_today.sent}/${stats.quota_today.quota} quota`
              : "No Gmail connected"
          }
        />
        <KpiCard
          label="Sent (7d)"
          value={stats.sent_7d.toLocaleString("id-ID")}
        />
        <KpiCard
          label="Open rate (7d)"
          value={`${openRate}%`}
          hint={`${stats.opened_7d} opened`}
          color="emerald"
        />
        <KpiCard
          label="Reply rate (7d)"
          value={`${replyRate}%`}
          hint={`${stats.replied_7d} replied`}
          color="blue"
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          label="Contacts"
          value={stats.contacts_total.toLocaleString("id-ID")}
          hint="in this workspace"
        />
        <KpiCard
          label="Templates"
          value={stats.templates_total.toString()}
        />
        <KpiCard
          label="Active queues"
          value={stats.queues_active.toString()}
          color={stats.queues_active > 0 ? "emerald" : "zinc"}
        />
        <KpiCard
          label="Pending replies"
          value={stats.pending_replies.toString()}
          hint="butuh tindakan"
          color={stats.pending_replies > 0 ? "blue" : "zinc"}
        />
      </div>

      {/* Recent replies */}
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            💬 Recent Replies
          </h2>
          {replies.length > 0 && (
            <span className="text-xs text-zinc-500">{replies.length} terbaru</span>
          )}
        </div>
        {replies.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/50">
            Belum ada balasan. Setelah lu kirim email dan ada yang reply, mereka muncul di sini.
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {replies.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                    🟣 {r.contact_name ?? r.contact_email}
                    {r.contact_company && (
                      <span className="ml-1 font-normal text-zinc-500">
                        · {r.contact_company}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {new Date(r.replied_at).toLocaleString("id-ID")}
                  </p>
                </div>
                {r.gmail_thread_id && (
                  <a
                    href={`https://mail.google.com/mail/u/0/#inbox/${r.gmail_thread_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    📧 Open in Gmail
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Recent activity */}
      <div className="mt-6">
        <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          📋 Activity (recent)
        </h2>
        {activity.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-4 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/50">
            Belum ada aktivitas.
          </div>
        ) : (
          <ul className="space-y-1 text-xs">
            {activity.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-zinc-600 dark:text-zinc-400"
              >
                <span>{activityEmoji(a.activity_type)}</span>
                <span>{describeActivity(a)}</span>
                <span className="ml-auto text-zinc-400">
                  {timeAgo(a.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Quick actions */}
      <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Quick actions
        </h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/w/${slug}/queues/new`}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-50 transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
          >
            + New Queue
          </Link>
          <Link
            href={`/w/${slug}/templates/new`}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          >
            + New Template
          </Link>
          <Link
            href={`/w/${slug}/contacts/import`}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          >
            Import Contacts
          </Link>
          <Link
            href={`/w/${slug}/pipeline`}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          >
            View Pipeline
          </Link>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  color = "zinc",
}: {
  label: string;
  value: string;
  hint?: string;
  color?: "zinc" | "emerald" | "blue";
}) {
  const valueColors = {
    zinc: "text-zinc-900 dark:text-zinc-100",
    emerald: "text-emerald-700 dark:text-emerald-400",
    blue: "text-blue-700 dark:text-blue-400",
  };
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold ${valueColors[color]}`}>
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-500">
          {hint}
        </p>
      )}
    </div>
  );
}

function activityEmoji(type: string): string {
  switch (type) {
    case "email_sent":
      return "📧";
    case "email_opened":
      return "👁";
    case "email_replied":
      return "💬";
    case "followup_sent":
      return "🔁";
    case "stage_changed":
      return "📋";
    default:
      return "•";
  }
}

function describeActivity(a: { activity_type: string; metadata: Record<string, unknown> }): string {
  switch (a.activity_type) {
    case "email_sent":
      return "Email sent";
    case "email_opened":
      return "Email opened";
    case "email_replied":
      return `Reply from ${(a.metadata.contact_email as string) ?? "contact"}`;
    case "followup_sent":
      return `Follow-up #${a.metadata.step ?? 1} sent to ${(a.metadata.contact_email as string) ?? "contact"}`;
    case "stage_changed":
      return `Moved contact to ${(a.metadata.new_stage_name as string) ?? "stage"}`;
    default:
      return a.activity_type;
  }
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "baru saja";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m lalu`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}j lalu`;
  return `${Math.floor(ms / 86_400_000)}h lalu`;
}
