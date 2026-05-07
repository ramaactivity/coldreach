import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Send,
  TrendingUp,
  MessageCircle,
  Inbox,
  ArrowUpRight,
  Plus,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { requireCurrentUser } from "@/lib/supabase/session-helpers";
import { getUserWorkspaces } from "@/lib/workspaces";
import { SimpleTopbar } from "@/components/simple-topbar";
import { getWorkspaceStats, getRecentReplies } from "@/lib/stats";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";

export default async function DashboardPage() {
  const user = await requireCurrentUser();
  const workspaces = await getUserWorkspaces();

  if (workspaces.length === 0) {
    redirect("/onboarding/workspace");
  }
  if (workspaces.length === 1) {
    redirect(`/w/${workspaces[0].slug}/dashboard`);
  }

  const [allStats, recentReplies] = await Promise.all([
    Promise.all(workspaces.map((w) => getWorkspaceStats(w.id))),
    getRecentReplies(null, 10),
  ]);

  const totals = allStats.reduce(
    (acc, s) => ({
      sent_today: acc.sent_today + s.sent_today,
      sent_7d: acc.sent_7d + s.sent_7d,
      replied_7d: acc.replied_7d + s.replied_7d,
      pending_replies: acc.pending_replies + s.pending_replies,
    }),
    { sent_today: 0, sent_7d: 0, replied_7d: 0, pending_replies: 0 },
  );

  const replyRate7d =
    totals.sent_7d > 0
      ? Math.round((totals.replied_7d / totals.sent_7d) * 100)
      : 0;

  return (
    <>
      <SimpleTopbar email={user.email ?? ""} />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <PageHeader
          eyebrow={
            <>
              <Sparkles className="h-3 w-3 text-amber-500" />
              <span>{workspaces.length} workspaces</span>
            </>
          }
          title="Semua Workspace"
          description="Aggregate view dari semua bisnis lu. Klik workspace untuk masuk lebih detail."
        />

        {/* Aggregate KPIs */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Sent today"
            value={totals.sent_today.toLocaleString("id-ID")}
            icon={Send}
            tone="default"
          />
          <StatCard
            label="Sent (7d)"
            value={totals.sent_7d.toLocaleString("id-ID")}
            icon={TrendingUp}
          />
          <StatCard
            label="Replied (7d)"
            value={totals.replied_7d.toLocaleString("id-ID")}
            icon={MessageCircle}
            tone="blue"
            hint={replyRate7d > 0 ? `${replyRate7d}% reply rate` : undefined}
          />
          <Link href="/inbox" className="block">
            <StatCard
              label="Pending replies"
              value={totals.pending_replies.toLocaleString("id-ID")}
              icon={Inbox}
              tone={totals.pending_replies > 0 ? "blue" : "default"}
              hint={
                totals.pending_replies > 0 ? "buka inbox →" : "buka inbox"
              }
            />
          </Link>
        </div>

        {/* Workspaces grid */}
        <h2 className="mt-10 mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Workspaces
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((ws, i) => {
            const s = allStats[i];
            return (
              <Link
                key={ws.id}
                href={`/w/${ws.slug}/dashboard`}
                className="group relative overflow-hidden rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] transition-all hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_8px_20px_-4px_rgb(0_0_0/0.08)] dark:border-zinc-800/80 dark:bg-zinc-900 dark:hover:border-zinc-700"
              >
                {/* Color accent strip */}
                <div
                  className="absolute inset-x-0 top-0 h-0.5 opacity-80"
                  style={{ backgroundColor: ws.color_theme }}
                />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: ws.color_theme }}
                    />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      {ws.business_type ?? "—"}
                    </span>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-zinc-300 transition-all group-hover:text-zinc-700 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 dark:text-zinc-700 dark:group-hover:text-zinc-300" />
                </div>

                <h3 className="mt-3 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                  {ws.name}
                </h3>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {ws.schedule_start_time.slice(0, 5)} – {ws.schedule_end_time.slice(0, 5)} WIB · {ws.daily_target}/hari
                </p>

                <div className="mt-5 grid grid-cols-3 gap-3 border-t border-zinc-100 pt-4 text-sm dark:border-zinc-800">
                  <Mini label="Today" value={s.sent_today} />
                  <Mini label="7d sent" value={s.sent_7d} />
                  <Mini label="Replied" value={s.replied_7d} accent="blue" />
                </div>

                {s.queues_active > 0 && (
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    </span>
                    {s.queues_active} active queue{s.queues_active > 1 ? "s" : ""}
                  </div>
                )}
              </Link>
            );
          })}

          <Link
            href="/onboarding/workspace"
            className="group flex items-center justify-center rounded-2xl border border-dashed border-zinc-300/70 bg-zinc-50/50 p-5 transition-all hover:-translate-y-0.5 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/30 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
          >
            <div className="flex flex-col items-center gap-2 text-zinc-500 transition-colors group-hover:text-zinc-900 dark:text-zinc-400 dark:group-hover:text-zinc-100">
              <Plus className="h-5 w-5" />
              <span className="text-sm font-medium">Tambah Workspace</span>
            </div>
          </Link>
        </div>

        {/* Recent replies */}
        <div className="mt-10 mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Recent Replies
          </h2>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {recentReplies.length > 0 ? `${recentReplies.length} terbaru` : "—"}
          </span>
        </div>

        {recentReplies.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="Belum ada balasan"
            description="Setelah lu kirim email pertama dan ada yang reply, mereka muncul di sini dengan link langsung ke Gmail thread."
          />
        ) : (
          <Card className="overflow-hidden p-0">
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {recentReplies.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                      <MessageCircle className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {r.contact_name ?? r.contact_email}
                        {r.contact_company && (
                          <span className="ml-1.5 font-normal text-zinc-500 dark:text-zinc-400">
                            · {r.contact_company}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                        {r.workspace_name && `${r.workspace_name} · `}
                        {new Date(r.replied_at).toLocaleString("id-ID", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                  </div>
                  {r.gmail_thread_id && (
                    <a
                      href={`https://mail.google.com/mail/u/0/#inbox/${r.gmail_thread_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                      <ExternalLink className="h-3 w-3" />
                      <span>Buka di Gmail</span>
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </main>
    </>
  );
}

function Mini({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "blue";
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p
        className={`mt-1 text-lg font-semibold tabular-nums tracking-tight ${
          accent === "blue"
            ? "text-blue-600 dark:text-blue-400"
            : "text-zinc-900 dark:text-zinc-100"
        }`}
      >
        {value.toLocaleString("id-ID")}
      </p>
    </div>
  );
}
