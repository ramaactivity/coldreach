import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { listTemplates } from "@/lib/templates";
import { createClient } from "@/lib/supabase/server";
import { CreateQueueForm } from "./create-queue-form";
import { createQueue, type CreateQueueState } from "../actions";

export default async function NewQueuePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();

  const templates = await listTemplates(workspace.id);

  // Get available tags from contacts in this user's database
  const supabase = await createClient();
  const { data: contactsWithTags } = await supabase
    .from("contacts")
    .select("tags")
    .is("deleted_at", null)
    .eq("status", "active")
    .limit(2000); // bound to keep it fast

  const tagSet = new Set<string>();
  for (const row of contactsWithTags ?? []) {
    for (const tag of (row as { tags: string[] }).tags ?? []) {
      tagSet.add(tag);
    }
  }
  const tags = Array.from(tagSet).sort();

  // Fetch contact count for default audience preview
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
      <div className="mx-auto max-w-2xl px-6 py-12 text-center">
        <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
          Belum ada template
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Lu butuh setidaknya 1 template untuk bikin queue. Buat template dulu.
        </p>
        <Link
          href={`/w/${slug}/templates/new`}
          className="mt-6 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          + New Template
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <Link
        href={`/w/${slug}/queues`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        ← Back to queues
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        New Queue
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Setup queue otomatis untuk workspace {workspace.name}.
      </p>
      <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
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
      </div>
    </div>
  );
}
