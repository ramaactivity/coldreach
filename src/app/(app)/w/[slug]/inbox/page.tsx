import { notFound } from "next/navigation";
import Link from "next/link";
import { Inbox, MessageCircle, AlarmClock, CheckCircle2 } from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { getInboxReplies, getInboxCounts, type InboxTab } from "@/lib/inbox";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { InboxRow } from "@/app/(app)/inbox/inbox-row";

const TABS: { value: InboxTab; label: string; icon: typeof Inbox }[] = [
  { value: "pending", label: "Pending", icon: MessageCircle },
  { value: "snoozed", label: "Snoozed", icon: AlarmClock },
  { value: "handled", label: "Handled", icon: CheckCircle2 },
];

export default async function WorkspaceInboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();

  const tab: InboxTab =
    sp.tab === "snoozed" || sp.tab === "handled" ? sp.tab : "pending";

  const [items, counts] = await Promise.all([
    getInboxReplies(workspace.id, tab),
    getInboxCounts(workspace.id),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        title="Reply Inbox"
        description={`Semua balasan untuk ${workspace.name}. Mark Handled biar inbox bersih, atau snooze untuk follow-up nanti.`}
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
              href={`/w/${slug}/inbox${t.value === "pending" ? "" : `?tab=${t.value}`}`}
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
              ? "Inbox kosong! 🎉"
              : tab === "snoozed"
                ? "Belum ada yang di-snooze"
                : "Belum ada yang ditangani"
          }
          description={
            tab === "pending"
              ? "Setiap kali ada kontak yang reply email lu, akan muncul di sini. Sekarang lu udah handle semuanya."
              : tab === "snoozed"
                ? "Kalau ada reply yang belum bisa lu balas sekarang, klik Snooze di tab Pending untuk balikin nanti."
                : "Reply yang udah lu Mark Handled akan disimpan di sini sebagai catatan."
          }
        />
      ) : (
        <Card className="overflow-visible p-0">
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <InboxRow
                key={item.id}
                item={item}
                stages={workspace.pipeline_stages}
                tab={tab}
                slug={slug}
                showWorkspace={false}
              />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
