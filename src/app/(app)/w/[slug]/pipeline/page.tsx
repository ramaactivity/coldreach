import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { createClient } from "@/lib/supabase/server";
import { PipelineColumn } from "./pipeline-column";
import { PageHeader } from "@/components/ui/page-header";

const MAX_CARDS_PER_COLUMN = 50;

export type PipelineContact = {
  contact_id: string;
  lead_stage_id: string | null;
  workspace_notes: string | null;
  last_contacted_at: string | null;
  last_replied_at: string | null;
  contact: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    position: string | null;
  };
};

export default async function PipelinePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();

  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("contact_workspace_data")
    .select(
      `contact_id, lead_stage_id, workspace_notes, last_contacted_at, last_replied_at,
       contact:contacts!inner(id, email, first_name, last_name, company, position)`,
    )
    .eq("workspace_id", workspace.id);

  const grouped = new Map<string, PipelineContact[]>();
  for (const stage of workspace.pipeline_stages) {
    grouped.set(stage.id, []);
  }
  for (const raw of rows ?? []) {
    const r = raw as unknown as {
      contact_id: string;
      lead_stage_id: string | null;
      workspace_notes: string | null;
      last_contacted_at: string | null;
      last_replied_at: string | null;
      contact:
        | PipelineContact["contact"]
        | Array<PipelineContact["contact"]>;
    };
    const contact = Array.isArray(r.contact) ? r.contact[0] : r.contact;
    if (!contact) continue;
    const stageId = r.lead_stage_id ?? "new";
    if (!grouped.has(stageId)) grouped.set(stageId, []);
    grouped.get(stageId)!.push({
      contact_id: r.contact_id,
      lead_stage_id: r.lead_stage_id,
      workspace_notes: r.workspace_notes,
      last_contacted_at: r.last_contacted_at,
      last_replied_at: r.last_replied_at,
      contact,
    });
  }

  return (
    <div className="px-6 py-8">
      <PageHeader
        title="Pipeline"
        description={`${workspace.pipeline_stages.length} stages · klik kontak buat ganti stage. Stages custom per workspace.`}
      />

      <div className="flex gap-3 overflow-x-auto pb-4">
        {workspace.pipeline_stages.map((stage) => {
          const items = grouped.get(stage.id) ?? [];
          return (
            <PipelineColumn
              key={stage.id}
              slug={slug}
              stage={stage}
              allStages={workspace.pipeline_stages}
              items={items}
              maxCards={MAX_CARDS_PER_COLUMN}
            />
          );
        })}
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
