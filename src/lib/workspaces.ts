import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/session-helpers";
import type { Workspace } from "@/lib/workspace-constants";

export type { Workspace, PipelineStage } from "@/lib/workspace-constants";

/**
 * Tag used to bust the workspace cache after mutations. Any workspace
 * create/edit/archive action should call:
 *   revalidateTag(WORKSPACE_CACHE_TAG)
 * to force the next read to hit the DB.
 */
export const WORKSPACE_CACHE_TAG = "user-workspaces";

/**
 * Persistent (cross-request) cache. Workspace data rarely changes —
 * 10 minutes TTL feels live but avoids hitting Supabase on every nav.
 * Service-role admin client is used so the cache key is purely the userId
 * (no auth-cookie variance).
 */
const cachedFetchUserWorkspaces = unstable_cache(
  async (userId: string): Promise<Workspace[]> => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("workspaces")
      .select("*")
      .eq("user_id", userId)
      .eq("is_archived", false)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("getUserWorkspaces error:", error);
      return [];
    }
    return (data ?? []) as Workspace[];
  },
  ["user-workspaces"],
  { tags: [WORKSPACE_CACHE_TAG], revalidate: 600 },
);

const cachedFetchWorkspaceBySlug = unstable_cache(
  async (userId: string, slug: string): Promise<Workspace | null> => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("workspaces")
      .select("*")
      .eq("user_id", userId)
      .eq("slug", slug)
      .eq("is_archived", false)
      .maybeSingle();

    if (error) {
      console.error("getWorkspaceBySlug error:", error);
      return null;
    }
    return (data as Workspace) ?? null;
  },
  ["workspace-by-slug"],
  { tags: [WORKSPACE_CACHE_TAG], revalidate: 600 },
);

/**
 * Per-request memoization on top of the persistent cache. Together: the
 * function fires at most once per request, and at most once per 10 minutes
 * of real time (per userId).
 */
export const getUserWorkspaces = cache(
  async (): Promise<Workspace[]> => {
    const user = await getCurrentUser();
    if (!user) return [];
    return cachedFetchUserWorkspaces(user.id);
  },
);

export const getWorkspaceBySlug = cache(
  async (slug: string): Promise<Workspace | null> => {
    const user = await getCurrentUser();
    if (!user) return null;
    return cachedFetchWorkspaceBySlug(user.id, slug);
  },
);
