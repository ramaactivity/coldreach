import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Workspace } from "@/lib/workspace-constants";

export type { Workspace, PipelineStage } from "@/lib/workspace-constants";

/**
 * Server-side fetch wrapped in React.cache so multiple calls within the
 * same request (layout + page + nested components) hit the DB only once.
 * Cleared automatically between requests.
 */
export const getUserWorkspaces = cache(
  async (): Promise<Workspace[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("workspaces")
      .select("*")
      .eq("is_archived", false)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("getUserWorkspaces error:", error);
      return [];
    }
    return (data ?? []) as Workspace[];
  },
);

export const getWorkspaceBySlug = cache(
  async (slug: string): Promise<Workspace | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("workspaces")
      .select("*")
      .eq("slug", slug)
      .eq("is_archived", false)
      .maybeSingle();

    if (error) {
      console.error("getWorkspaceBySlug error:", error);
      return null;
    }
    return (data as Workspace) ?? null;
  },
);
