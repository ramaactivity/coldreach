"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug } from "@/lib/workspaces";

export type SavedFilter = {
  id: string;
  name: string;
  filter_definition: Record<string, string>;
  is_pinned: boolean;
  created_at: string;
};

type Result = { ok: true } | { ok: false; error: string };

async function authedWorkspace(slug: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const ws = await getWorkspaceBySlug(slug);
  return { supabase, user, ws };
}

export async function listSavedFilters(slug: string): Promise<SavedFilter[]> {
  const { supabase, ws } = await authedWorkspace(slug);
  if (!ws) return [];
  const { data } = await supabase
    .from("saved_filters")
    .select("id, name, filter_definition, is_pinned, created_at")
    .eq("workspace_id", ws.id)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: true });
  return (data ?? []) as SavedFilter[];
}

export async function createSavedFilter(
  slug: string,
  name: string,
  definition: Record<string, string>,
): Promise<Result> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Nama filter tidak boleh kosong" };
  const { supabase, user, ws } = await authedWorkspace(slug);
  if (!ws) return { ok: false, error: "Workspace not found" };

  const { error } = await supabase.from("saved_filters").insert({
    user_id: user.id,
    workspace_id: ws.id,
    name: trimmed,
    filter_definition: definition,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/w/${slug}/contacts`);
  return { ok: true };
}

export async function deleteSavedFilter(
  slug: string,
  id: string,
): Promise<Result> {
  const { supabase } = await authedWorkspace(slug);
  const { error } = await supabase.from("saved_filters").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/w/${slug}/contacts`);
  return { ok: true };
}

export async function toggleSavedFilterPin(
  slug: string,
  id: string,
  pinned: boolean,
): Promise<Result> {
  const { supabase } = await authedWorkspace(slug);
  const { error } = await supabase
    .from("saved_filters")
    .update({ is_pinned: pinned })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/w/${slug}/contacts`);
  return { ok: true };
}
