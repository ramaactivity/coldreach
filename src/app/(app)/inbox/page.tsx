import { redirect } from "next/navigation";
import Link from "next/link";
import { Inbox, MessageCircle, AlarmClock, CheckCircle2 } from "lucide-react";
import { requireCurrentUser } from "@/lib/supabase/session-helpers";
import { getUserWorkspaces } from "@/lib/workspaces";
import { getInboxReplies, getInboxCounts, type InboxTab } from "@/lib/inbox";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SimpleTopbar } from "@/components/simple-topbar";
import { InboxRow } from "./inbox-row";

const TABS: { value: InboxTab; label: string; icon: typeof Inbox }[] = [
  { value: "pending", label: "Pending", icon: MessageCircle },
  { value: "snoozed", label: "Snoozed", icon: AlarmClock },
  { value: "handled", label: "Handled", icon: CheckCircle2 },
];

export default async function GlobalInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireCurrentUser();
  const sp = await searchParams;
  const tab: InboxTab =
    sp.tab === "snoozed" || sp.tab === "handled" ? sp.tab : "pending";

  const workspaces = await getUserWorkspaces();
  if (workspaces.length === 0) redirect("/onboarding/workspace");

  const stagesByWorkspace = new Map(
    workspaces.map((w) => [w.id, w.pipeline_stages]),
  );

  const [items, counts] = await Promise.all([
    getInboxReplies(null, tab),
    getInboxCounts(null),
  ]);

  return (
    <>
      <SimpleTopbar email={user.email ?? ""} />
      <main className="mx-auto w-full max-w-7xl px-6 py-8 lg:px-8">
        <PageHeader
          title="Reply Inbox"
          description={`Semua balasan dari ${workspaces.length} workspace, terkonsolidasi di satu tempat.`}
        />

        {/* Tabs */}
        <div className="mb-4 flex gap-1 rounded-lg border border-border/80 bg-surface-sunken/50 p-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.value;
            const count = counts[t.value];
            return (
              <Link
                key={t.value}
                href={`/inbox${t.value === "pending" ? "" : `?tab=${t.value}`}`}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                  active
                    ? "bg-surface text-ink"
                    : "text-muted hover:text-ink"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{t.label}</span>
                {count > 0 && (
                  <span
                    className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular ${
                      active
                        ? "bg-action text-on-action"
                        : "bg-surface-hover text-ink-secondary"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {items.length === 0 ? (
          <EmptyState
            icon={tab === "pending" ? Inbox : tab === "snoozed" ? AlarmClock : CheckCircle2}
            title={
              tab === "pending"
                ? "Inbox kosong di semua workspace! 🎉"
                : tab === "snoozed"
                  ? "Belum ada yang di-snooze"
                  : "Belum ada yang ditangani"
            }
            description={
              tab === "pending"
                ? "Setiap kali ada kontak yang reply, akan muncul di sini. Lu udah handle semuanya."
                : tab === "snoozed"
                  ? "Snooze reply biar dia muncul lagi nanti pada waktunya."
                  : "Riwayat reply yang udah lu tangani akan disimpan di sini."
            }
          />
        ) : (
          <Card className="overflow-visible p-0">
            <ul className="divide-y divide-border">
              {items.map((item) => (
                <InboxRow
                  key={item.id}
                  item={item}
                  stages={stagesByWorkspace.get(item.workspace_id) ?? []}
                  tab={tab}
                  slug={null}
                  showWorkspace={true}
                />
              ))}
            </ul>
          </Card>
        )}
      </main>
    </>
  );
}
