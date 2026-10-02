import { notFound } from "next/navigation";
import { PenLine } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { todayWIB } from "@/lib/holidays-id";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { DraftList, DraftSettings, type Draft } from "./drafts-client";
import { SentList } from "./sent-list";

export default async function DraftsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace || !workspace.approval_mode) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("queue_recipients")
    .select(
      "id, status, scheduled_for_date, custom_subject, custom_body, created_at, contact:contacts!inner(email, company, first_name, last_name, position)",
    )
    .eq("workspace_id", workspace.id)
    // Scheduled drafts too: in auto mode nothing waits for approval, but the
    // owner must still be able to read, edit or cancel before they go out.
    .in("status", ["awaiting_approval", "pending"])
    .not("custom_body", "is", null)
    .order("created_at")
    .limit(200);

  const drafts: Draft[] = (data ?? []).map((r) => {
    const c = Array.isArray(r.contact) ? r.contact[0] : r.contact;
    return {
      id: r.id as string,
      scheduled: r.status === "pending",
      scheduledFor:
        r.scheduled_for_date && (r.scheduled_for_date as string) > todayWIB()
          ? (r.scheduled_for_date as string)
          : null,
      subject: (r.custom_subject as string | null) ?? "",
      body: (r.custom_body as string | null) ?? "",
      createdAt: r.created_at as string,
      email: c?.email ?? "",
      company: c?.company ?? null,
      person: [c?.first_name, c?.last_name].filter(Boolean).join(" ") || null,
      position: c?.position ?? null,
    };
  });

  const waiting = drafts.filter((d) => !d.scheduled);
  const scheduled = drafts.filter((d) => d.scheduled);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 lg:px-8">
      <PageHeader
        title="Draf Hermes"
        description="Draf email personal dari agent sales Hermes. Yang disetujui masuk antrean dan dikirim sesuai jadwal, kuota, dan aturan deliverability yang sama."
      />
      <DraftSettings
        slug={slug}
        approvalMode={workspace.approval_mode}
        dailyNewCap={workspace.daily_new_cap}
      />
      <div className="space-y-10">
        {drafts.length === 0 ? (
          <EmptyState
            icon={PenLine}
            title="Tidak ada draf"
            description="Draf baru dari Hermes muncul di sini sampai terkirim atau dibatalkan."
          />
        ) : (
          <>
            {waiting.length > 0 && <DraftList slug={slug} drafts={waiting} />}
            {scheduled.length > 0 && <DraftList slug={slug} drafts={scheduled} />}
          </>
        )}
        <SentList workspaceId={workspace.id} />
      </div>
    </div>
  );
}
