import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { listTemplates } from "@/lib/templates";
import { createClient } from "@/lib/supabase/server";
import { CreateCampaignForm } from "./create-campaign-form";
import { createCampaign, type CreateCampaignState } from "../actions";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";

export default async function NewCampaignPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();

  const supabase = await createClient();
  const [templates, contactsResult, tagsResult] = await Promise.all([
    listTemplates(workspace.id),
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("status", "active"),
    supabase
      .from("contacts")
      .select("tags")
      .is("deleted_at", null)
      .eq("status", "active")
      .limit(2000),
  ]);

  const tagSet = new Set<string>();
  for (const row of tagsResult.data ?? []) {
    for (const tag of (row as { tags: string[] }).tags ?? []) tagSet.add(tag);
  }
  const tags = Array.from(tagSet).sort();
  const totalActiveContacts = contactsResult.count ?? 0;

  async function action(_prev: CreateCampaignState, formData: FormData) {
    "use server";
    const result = await createCampaign(slug, _prev, formData);
    if (result.campaignId) {
      redirect(`/w/${slug}/campaigns/${result.campaignId}`);
    }
    return result;
  }

  if (templates.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Link
          href={`/w/${slug}/campaigns`}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to campaigns
        </Link>
        <EmptyState
          icon={FileText}
          title="Belum ada template"
          description="Lu butuh setidaknya 1 template untuk bikin campaign. Buat template dulu, baru balik ke sini."
          action={
            <ButtonLink href={`/w/${slug}/templates/new`}>
              + New Template
            </ButtonLink>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <Link
        href={`/w/${slug}/campaigns`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to campaigns
      </Link>
      <PageHeader
        title="New Campaign"
        description="One-shot blast — kirim sekarang juga atau jadwalkan di waktu tertentu. Selesai sendiri saat semua kontak sudah dikirim."
      />
      <Card className="p-6">
        <CreateCampaignForm
          action={action}
          templates={templates.map((t) => ({
            id: t.id,
            name: t.name,
            attachmentCount: t.attachments.length,
          }))}
          tags={tags}
          totalActiveContacts={totalActiveContacts}
        />
      </Card>
    </div>
  );
}
