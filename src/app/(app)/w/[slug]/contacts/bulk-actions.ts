"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug } from "@/lib/workspaces";

type Result = { ok: true; affected: number } | { ok: false; error: string };

async function authAndWorkspace(slug: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) throw new Error("Workspace not found");
  return { supabase, user, workspace };
}

function normalizeTags(input: string): string[] {
  return input
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Append tags to each contact's tags array, dedup. One UPDATE per contact
 * because Postgres' array_append is awkward via Supabase JS — but we run
 * them in parallel so latency is roughly one round-trip.
 */
export async function bulkAddTags(
  slug: string,
  contactIds: string[],
  tagsRaw: string,
): Promise<Result> {
  if (contactIds.length === 0) return { ok: true, affected: 0 };
  const newTags = normalizeTags(tagsRaw);
  if (newTags.length === 0) {
    return { ok: false, error: "Tag tidak boleh kosong" };
  }

  const { supabase } = await authAndWorkspace(slug);

  const { data: rows, error: fetchErr } = await supabase
    .from("contacts")
    .select("id, tags")
    .in("id", contactIds);
  if (fetchErr) return { ok: false, error: fetchErr.message };

  await Promise.all(
    (rows ?? []).map((r) => {
      const existing = (r.tags as string[] | null) ?? [];
      const merged = Array.from(new Set([...existing, ...newTags]));
      return supabase
        .from("contacts")
        .update({ tags: merged })
        .eq("id", r.id);
    }),
  );

  revalidatePath(`/w/${slug}/contacts`);
  return { ok: true, affected: rows?.length ?? 0 };
}

export async function bulkChangeStage(
  slug: string,
  contactIds: string[],
  stageId: string,
): Promise<Result> {
  if (contactIds.length === 0) return { ok: true, affected: 0 };
  const { supabase, user, workspace } = await authAndWorkspace(slug);

  const stage = workspace.pipeline_stages.find((s) => s.id === stageId);
  if (!stage) return { ok: false, error: "Stage tidak valid" };

  const now = new Date().toISOString();
  const upsertRows = contactIds.map((cid) => ({
    contact_id: cid,
    workspace_id: workspace.id,
    user_id: user.id,
    lead_stage_id: stageId,
    lead_stage_updated_at: now,
  }));

  const { error } = await supabase
    .from("contact_workspace_data")
    .upsert(upsertRows, { onConflict: "contact_id,workspace_id" });
  if (error) return { ok: false, error: error.message };

  // Activity log per contact
  await supabase.from("activity_log").insert(
    contactIds.map((cid) => ({
      user_id: user.id,
      workspace_id: workspace.id,
      activity_type: "stage_changed",
      entity_type: "contact",
      entity_id: cid,
      metadata: {
        new_stage_id: stageId,
        new_stage_name: stage.name,
        bulk: true,
      },
    })),
  );

  revalidatePath(`/w/${slug}/contacts`);
  revalidatePath(`/w/${slug}/pipeline`);
  return { ok: true, affected: contactIds.length };
}

export async function bulkDelete(
  slug: string,
  contactIds: string[],
): Promise<Result> {
  if (contactIds.length === 0) return { ok: true, affected: 0 };
  const { supabase } = await authAndWorkspace(slug);

  const { error } = await supabase
    .from("contacts")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", contactIds);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/w/${slug}/contacts`);
  return { ok: true, affected: contactIds.length };
}

export async function bulkArchive(
  slug: string,
  contactIds: string[],
): Promise<Result> {
  if (contactIds.length === 0) return { ok: true, affected: 0 };
  const { supabase } = await authAndWorkspace(slug);

  const nowIso = new Date().toISOString();
  const { error, data } = await supabase
    .from("contacts")
    .update({ archived_at: nowIso, archive_reason: "manual" })
    .in("id", contactIds)
    .is("archived_at", null)
    .select("id");
  if (error) return { ok: false, error: error.message };

  // Sweep pending queue work for the just-archived contacts.
  await supabase
    .from("queue_recipients")
    .update({ status: "skipped" })
    .in("contact_id", contactIds)
    .eq("status", "pending");

  revalidatePath(`/w/${slug}/contacts`);
  return { ok: true, affected: data?.length ?? 0 };
}

export async function bulkUnarchive(
  slug: string,
  contactIds: string[],
): Promise<Result> {
  if (contactIds.length === 0) return { ok: true, affected: 0 };
  const { supabase } = await authAndWorkspace(slug);

  const { error, data } = await supabase
    .from("contacts")
    .update({ archived_at: null, archive_reason: null, status: "active" })
    .in("id", contactIds)
    .select("id");
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/w/${slug}/contacts`);
  return { ok: true, affected: data?.length ?? 0 };
}
