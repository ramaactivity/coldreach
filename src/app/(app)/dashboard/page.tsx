import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Send,
  TrendingUp,
  Eye,
  MessageCircle,
  Inbox,
  Users,
  FileText,
  Sparkles,
  Coins,
  AlertTriangle,
  ArrowUpRight,
  Plus,
  ExternalLink,
} from "lucide-react";
import { requireCurrentUser } from "@/lib/supabase/session-helpers";
import { getUserWorkspaces } from "@/lib/workspaces";
import { createClient } from "@/lib/supabase/server";
import { getApolloCreditStatus } from "@/lib/apollo-credits";
import { SimpleTopbar } from "@/components/simple-topbar";
import { getWorkspaceStats, getRecentReplies } from "@/lib/stats";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { HolidayNotice } from "@/components/holiday-notice";
import { accentFromColorTheme } from "@/lib/workspace-constants";
import { cn } from "@/lib/utils";

export default async function DashboardPage() {
  const user = await requireCurrentUser();
  const workspaces = await getUserWorkspaces();

  if (workspaces.length === 0) {
    redirect("/onboarding/workspace");
  }
  if (workspaces.length === 1) {
    redirect(`/w/${workspaces[0].slug}/dashboard`);
  }

  const supabase = await createClient();
  const [allStats, recentReplies, contactsRes, apollo] = await Promise.all([
    Promise.all(workspaces.map((w) => getWorkspaceStats(w.id))),
    getRecentReplies(null, 10),
    // Total active contacts in the shared pool (user-scoped, not per-workspace).
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .is("archived_at", null),
    getApolloCreditStatus(supabase, user.id).catch(() => null),
  ]);

  const t = allStats.reduce(
    (acc, s) => ({
      sent_today: acc.sent_today + s.sent_today,
      sent_7d: acc.sent_7d + s.sent_7d,
      opened_7d: acc.opened_7d + s.opened_7d,
      replied_7d: acc.replied_7d + s.replied_7d,
      pending_replies: acc.pending_replies + s.pending_replies,
      bounced_7d: acc.bounced_7d + s.bounced_7d,
      templates_total: acc.templates_total + s.templates_total,
      queues_active: acc.queues_active + s.queues_active,
    }),
    {
      sent_today: 0,
      sent_7d: 0,
      opened_7d: 0,
      replied_7d: 0,
      pending_replies: 0,
      bounced_7d: 0,
      templates_total: 0,
      queues_active: 0,
    },
  );

  const totalContacts = contactsRes.count ?? 0;
  const openRate = t.sent_7d > 0 ? Math.round((t.opened_7d / t.sent_7d) * 100) : 0;
  const replyRate =
    t.sent_7d > 0 ? Math.round((t.replied_7d / t.sent_7d) * 100) : 0;
  const bounceRate =
    t.sent_7d > 0 ? Math.round((t.bounced_7d / t.sent_7d) * 100) : 0;

  return (
    <>
      <SimpleTopbar email={user.email ?? ""} />
      <main className="mx-auto w-full max-w-7xl px-6 py-8 lg:px-8">
        <PageHeader
          eyebrow={
            <>
              <Sparkles className="h-3 w-3 text-muted" />
              <span>{workspaces.length} workspaces</span>
            </>
          }
          title="Semua Workspace"
          description="Aggregate view dari semua bisnis lu. Klik workspace untuk masuk lebih detail."
        />

        <HolidayNotice />

        {/* Sending & performance */}
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          <StatCard
            label="Sent today"
            value={t.sent_today.toLocaleString("id-ID")}
            icon={Send}
            hint="seluruh workspace"
          />
          <StatCard
            label="Sent (7d)"
            value={t.sent_7d.toLocaleString("id-ID")}
            icon={TrendingUp}
          />
          <StatCard
            label="Open rate"
            value={`${openRate}%`}
            icon={Eye}
            tone="success"
            hint={`${t.opened_7d.toLocaleString("id-ID")} opened (7d)`}
          />
          <StatCard
            label="Reply rate"
            value={`${replyRate}%`}
            icon={MessageCircle}
            tone="info"
            hint={`${t.replied_7d.toLocaleString("id-ID")} replied (7d)`}
          />
        </div>

        {/* Scale & resources */}
        <div className="mt-3.5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          <StatCard
            label="Total contacts"
            value={totalContacts.toLocaleString("id-ID")}
            icon={Users}
            hint="shared pool · aktif"
          />
          <StatCard
            label="Templates"
            value={t.templates_total.toLocaleString("id-ID")}
            icon={FileText}
            hint="semua workspace"
          />
          <StatCard
            label="Active queues"
            value={t.queues_active.toLocaleString("id-ID")}
            icon={Sparkles}
            hint="lagi jalan"
          />
          {apollo ? (
            <StatCard
              label="Kredit Apollo"
              value={`≈${apollo.remainingEst.toLocaleString("id-ID")}`}
              icon={Coins}
              hint={`reset ${apollo.daysToReset} hari lagi`}
            />
          ) : (
            <Link href="/inbox" className="block">
              <StatCard
                label="Pending replies"
                value={t.pending_replies.toLocaleString("id-ID")}
                icon={Inbox}
                hint="buka inbox →"
              />
            </Link>
          )}
        </div>

        {/* Attention — only when Apollo occupied the slot above */}
        {apollo && (
          <div className="mt-3.5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            <Link href="/inbox" className="block">
              <StatCard
                label="Pending replies"
                value={t.pending_replies.toLocaleString("id-ID")}
                icon={Inbox}
                hint="buka inbox →"
              />
            </Link>
            <StatCard
              label="Bounced (7d)"
              value={t.bounced_7d.toLocaleString("id-ID")}
              icon={AlertTriangle}
              tone={t.bounced_7d > 0 ? "danger" : "default"}
              hint={t.sent_7d > 0 ? `${bounceRate}% bounce rate` : "delivery"}
            />
          </div>
        )}

        {/* Workspaces */}
        <h2 className="mb-3 mt-10 text-ink">Workspaces</h2>
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((ws, i) => {
            const s = allStats[i];
            const quota = s.quota_today;
            return (
              <Link
                key={ws.id}
                href={`/w/${ws.slug}/dashboard`}
                data-accent={accentFromColorTheme(ws.color_theme)}
                className="group flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong"
              >
                <div className="flex items-start justify-between">
                  <span className="label-eyebrow flex items-center gap-1.5 text-accent-text">
                    <span className="inline-block size-1.5 rounded-full bg-accent" />
                    {ws.business_type ?? "—"}
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink-secondary" />
                </div>

                <div>
                  <h3 className="text-[15px] font-semibold text-ink">
                    {ws.name}
                  </h3>
                  <p className="mt-0.5 text-xs text-muted">
                    {ws.schedule_start_time.slice(0, 5)} –{" "}
                    {ws.schedule_end_time.slice(0, 5)} WIB
                    {quota && (
                      <>
                        {" · "}
                        <span className="tabular">
                          {quota.sent}/{quota.quota}
                        </span>{" "}
                        quota
                      </>
                    )}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 border-t border-border pt-3">
                  <Mini label="Today" value={s.sent_today} />
                  <Mini label="7d sent" value={s.sent_7d} />
                  <Mini label="Replied" value={s.replied_7d} tone="info" />
                </div>

                {s.queues_active > 0 ? (
                  <span className="flex items-center gap-2 text-xs font-medium text-success-text">
                    <span className="relative flex size-1.5">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-success" />
                    </span>
                    {s.queues_active} active queue{s.queues_active > 1 ? "s" : ""}
                  </span>
                ) : (
                  <span className="text-xs text-faint">No active queue</span>
                )}
              </Link>
            );
          })}

          <Link
            href="/onboarding/workspace"
            className="group flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface-sunken p-5 text-muted transition-colors hover:border-action hover:text-ink"
          >
            <Plus className="h-5 w-5" />
            <span className="text-sm font-medium">Tambah Workspace</span>
          </Link>
        </div>

        {/* Recent replies */}
        <div className="mb-3 mt-10 flex items-center justify-between">
          <h2 className="text-ink">Recent Replies</h2>
          <span className="text-xs text-muted">
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
            <ul className="divide-y divide-border">
              {recentReplies.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-surface-hover"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-info-soft text-info">
                      <MessageCircle className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {r.contact_name ?? r.contact_email}
                        {r.contact_company && (
                          <span className="ml-1.5 font-normal text-muted">
                            · {r.contact_company}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
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
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink"
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
  tone,
}: {
  label: string;
  value: number;
  tone?: "info";
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold tabular tracking-tight",
          tone === "info" ? "text-info" : "text-ink",
        )}
      >
        {value.toLocaleString("id-ID")}
      </p>
    </div>
  );
}
