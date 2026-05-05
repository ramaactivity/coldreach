"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug } from "@/lib/workspaces";

export async function moveContactStage(
  slug: string,
  contactId: string,
  newStageId: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) return { error: "Workspace not found" };

  // Validate stageId exists in workspace pipeline
  const validStage = workspace.pipeline_stages.find(
    (s) => s.id === newStageId,
  );
  if (!validStage) return { error: "Invalid stage" };

  await supabase
    .from("contact_workspace_data")
    .upsert(
      {
        contact_id: contactId,
        workspace_id: workspace.id,
        user_id: user.id,
        lead_stage_id: newStageId,
        lead_stage_updated_at: new Date().toISOString(),
      },
      { onConflict: "contact_id,workspace_id" },
    );

  await supabase.from("activity_log").insert({
    user_id: user.id,
    workspace_id: workspace.id,
    activity_type: "stage_changed",
    entity_type: "contact",
    entity_id: contactId,
    metadata: { new_stage_id: newStageId, new_stage_name: validStage.name },
  });

  revalidatePath(`/w/${slug}/pipeline`);
  return { success: true };
}
