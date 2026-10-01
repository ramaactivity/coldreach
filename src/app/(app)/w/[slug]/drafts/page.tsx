import { notFound } from "next/navigation";
import { PenLine } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { DraftList, DraftSettings, type Draft } from "./drafts-client";

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
      "id, custom_subject, custom_body, created_at, contact:contacts!inner(email, company, first_name, last_name, position)",
    )
    .eq("workspace_id", workspace.id)
    .eq("status", "awaiting_approval")
    .order("created_at")
    .limit(200);

  const drafts: Draft[] = (data ?? []).map((r) => {
    const c = Array.isArray(r.contact) ? r.contact[0] : r.contact;
    return {
      id: r.id as string,
      subject: (r.custom_subject as string | null) ?? "",
      body: (r.custom_body as string | null) ?? "",
      createdAt: r.created_at as string,
      email: c?.email ?? "",
      company: c?.company ?? null,
      person: [c?.first_name, c?.last_name].filter(Boolean).join(" ") || null,
      position: c?.position ?? null,
    };
  });

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
      {drafts.length === 0 ? (
        <EmptyState
          icon={PenLine}
          title="Tidak ada draf menunggu"
          description="Draf baru dari Hermes muncul di sini sampai kamu setujui atau batalkan."
        />
      ) : (
        <DraftList slug={slug} drafts={drafts} />
      )}
    </div>
  );
}
