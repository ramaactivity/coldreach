import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { listTemplates } from "@/lib/templates";
import { createClient } from "@/lib/supabase/server";
import { CreateQueueForm } from "./create-queue-form";
import { createQueue, type CreateQueueState } from "../actions";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";

export default async function NewQueuePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();

  const templates = await listTemplates(workspace.id);

  const supabase = await createClient();
  const { data: contactsWithTags } = await supabase
    .from("contacts")
    .select("tags")
    .is("deleted_at", null)
    .eq("status", "active")
    .limit(2000);

  const tagSet = new Set<string>();
  for (const row of contactsWithTags ?? []) {
    for (const tag of (row as { tags: string[] }).tags ?? []) {
      tagSet.add(tag);
    }
  }
  const tags = Array.from(tagSet).sort();

  const { count: totalActiveContacts } = await supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .eq("status", "active");

  async function action(_prev: CreateQueueState, formData: FormData) {
    "use server";
    const result = await createQueue(slug, _prev, formData);
    if (result.queueId) {
      redirect(`/w/${slug}/queues/${result.queueId}`);
    }
    return result;
  }

  if (templates.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Link
          href={`/w/${slug}/queues`}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to queues
        </Link>
        <EmptyState
          icon={FileText}
          title="Belum ada template"
          description="Lu butuh setidaknya 1 template untuk bikin queue. Buat template dulu, baru balik ke sini."
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
        href={`/w/${slug}/queues`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to queues
      </Link>
      <PageHeader
        title="New Queue"
        description={`Setup queue otomatis untuk workspace ${workspace.name}.`}
      />
      <Card className="p-6">
        <CreateQueueForm
          action={action}
          templates={templates.map((t) => ({
            id: t.id,
            name: t.name,
            attachmentCount: t.attachments.length,
          }))}
          tags={tags}
          totalActiveContacts={totalActiveContacts ?? 0}
          workspaceDefaults={{
            schedule_start_time: workspace.schedule_start_time.slice(0, 5),
            schedule_end_time: workspace.schedule_end_time.slice(0, 5),
            daily_target: workspace.daily_target,
          }}
        />
      </Card>
    </div>
  );
}
