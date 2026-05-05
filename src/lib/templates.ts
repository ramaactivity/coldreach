import { createClient } from "@/lib/supabase/server";
import type { TemplateWithAttachments } from "@/lib/template-helpers";

export type {
  Template,
  TemplateAttachment,
  TemplateWithAttachments,
} from "@/lib/template-helpers";

export async function listTemplates(
  workspaceId: string,
): Promise<TemplateWithAttachments[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("templates")
    .select(`*, attachments:template_attachments(*)`)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("listTemplates error:", error);
    return [];
  }
  return (data ?? []) as TemplateWithAttachments[];
}

export async function getTemplateById(
  id: string,
): Promise<TemplateWithAttachments | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("templates")
    .select(`*, attachments:template_attachments(*)`)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("getTemplateById error:", error);
    return null;
  }
  return (data as TemplateWithAttachments) ?? null;
}
