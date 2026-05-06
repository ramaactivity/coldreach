import { createClient } from "@/lib/supabase/server";
import type { TemplateWithAttachments } from "@/lib/template-helpers";

export type {
  Template,
  TemplateAttachment,
  TemplateWithAttachments,
} from "@/lib/template-helpers";

export type TemplateStats = {
  template_id: string;
  sent_count: number;
  opened_count: number;
  replied_count: number;
  last_used_at: string | null;
  open_rate: number; // 0..1
  reply_rate: number; // 0..1
};

/**
 * Returns a Map<template_id, stats> for every template in the workspace
 * that has been used at least once. Templates with zero sends are
 * absent from the map (caller treats as zeros).
 */
export async function getTemplateStats(
  workspaceId: string,
): Promise<Map<string, TemplateStats>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_template_stats_for_workspace",
    { ws_id: workspaceId },
  );
  if (error) {
    console.error("getTemplateStats error:", error);
    return new Map();
  }

  const out = new Map<string, TemplateStats>();
  for (const row of (data ?? []) as Array<{
    template_id: string;
    sent_count: number;
    opened_count: number;
    replied_count: number;
    last_used_at: string | null;
  }>) {
    const sent = row.sent_count ?? 0;
    out.set(row.template_id, {
      template_id: row.template_id,
      sent_count: sent,
      opened_count: row.opened_count ?? 0,
      replied_count: row.replied_count ?? 0,
      last_used_at: row.last_used_at,
      open_rate: sent > 0 ? (row.opened_count ?? 0) / sent : 0,
      reply_rate: sent > 0 ? (row.replied_count ?? 0) / sent : 0,
    });
  }
  return out;
}

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
