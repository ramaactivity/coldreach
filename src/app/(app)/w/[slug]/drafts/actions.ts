"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug, WORKSPACE_CACHE_TAG } from "@/lib/workspaces";

type Result = { ok: true; count?: number } | { ok: false; error: string };

/** Session client (RLS) + the workspace the slug points at. */
async function ctx(slug: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace || workspace.user_id !== user.id) return null;
  return { supabase, workspace };
}

async function syncCounters(supabase: Awaited<ReturnType<typeof createClient>>, workspaceId: string) {
  const { data: queues } = await supabase
    .from("send_queues")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("is_one_shot", false);
  await Promise.all((queues ?? []).map((q) => supabase.rpc("sync_queue_counters", { p_queue_id: q.id })));
}

/** ids = null → every draft awaiting approval in this workspace. */
export async function approveDrafts(slug: string, ids: string[] | null): Promise<Result> {
  const c = await ctx(slug);
  if (!c) return { ok: false, error: "Workspace tidak ditemukan" };
  let q = c.supabase
    .from("queue_recipients")
    .update({ status: "pending", status_reason: null })
    .eq("workspace_id", c.workspace.id)
    .eq("status", "awaiting_approval");
  if (ids) q = q.in("id", ids);
  const { data, error } = await q.select("id");
  if (error) return { ok: false, error: error.message };
  await syncCounters(c.supabase, c.workspace.id);
  revalidatePath(`/w/${slug}/drafts`);
  return { ok: true, count: data?.length ?? 0 };
}

export async function cancelDraft(slug: string, id: string): Promise<Result> {
  const c = await ctx(slug);
  if (!c) return { ok: false, error: "Workspace tidak ditemukan" };
  const { data, error } = await c.supabase
    .from("queue_recipients")
    .update({ status: "skipped", status_reason: "dibatalkan Rama" })
    .eq("workspace_id", c.workspace.id)
    .eq("id", id)
    .in("status", ["awaiting_approval", "pending"])
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Draf sudah terkirim atau dibatalkan" };
  await syncCounters(c.supabase, c.workspace.id);
  revalidatePath(`/w/${slug}/drafts`);
  return { ok: true };
}

export async function updateDraft(
  slug: string,
  id: string,
  subject: string,
  body: string,
): Promise<Result> {
  const c = await ctx(slug);
  if (!c) return { ok: false, error: "Workspace tidak ditemukan" };
  if (!subject.trim() || body.trim().length < 20) {
    return { ok: false, error: "Subjek wajib diisi dan isi minimal 20 karakter" };
  }
  const { data, error } = await c.supabase
    .from("queue_recipients")
    .update({ custom_subject: subject.trim(), custom_body: body.trim() })
    .eq("workspace_id", c.workspace.id)
    .eq("id", id)
    .in("status", ["awaiting_approval", "pending"])
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Draf sudah terkirim atau dibatalkan" };
  revalidatePath(`/w/${slug}/drafts`);
  return { ok: true };
}

export async function updateDraftSettings(
  slug: string,
  approvalMode: "manual" | "auto",
  dailyNewCap: number | null,
): Promise<Result> {
  const c = await ctx(slug);
  if (!c) return { ok: false, error: "Workspace tidak ditemukan" };
  if (dailyNewCap !== null && (!Number.isInteger(dailyNewCap) || dailyNewCap < 0 || dailyNewCap > 500)) {
    return { ok: false, error: "Batas harian harus 0–500" };
  }
  const { error } = await c.supabase
    .from("workspaces")
    .update({ approval_mode: approvalMode, daily_new_cap: dailyNewCap })
    .eq("id", c.workspace.id);
  if (error) return { ok: false, error: error.message };
  updateTag(WORKSPACE_CACHE_TAG);
  revalidatePath(`/w/${slug}/drafts`);
  return { ok: true };
}
