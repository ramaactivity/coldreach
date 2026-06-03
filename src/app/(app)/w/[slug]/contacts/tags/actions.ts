"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Result =
  | { ok: true; affected: number }
  | { ok: false; error: string };

function normalize(t: string): string {
  return t.trim().toLowerCase();
}

async function authedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

/**
 * Replace tag oldName with newName across all of user's contacts.
 * Idempotent: if a contact already has both, the array is deduped.
 */
export async function renameTag(
  slug: string,
  oldName: string,
  newName: string,
): Promise<Result> {
  const oldT = normalize(oldName);
  const newT = normalize(newName);
  if (!oldT || !newT) {
    return { ok: false, error: "Nama tag tidak boleh kosong" };
  }
  if (oldT === newT) {
    return { ok: false, error: "Tag baru sama dengan tag lama" };
  }

  const { supabase, userId } = await authedClient();
  const { data, error: fetchErr } = await supabase
    .from("contacts")
    .select("id, tags")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .contains("tags", [oldT]);
  if (fetchErr) return { ok: false, error: fetchErr.message };

  const rows = (data ?? []) as Array<{ id: string; tags: string[] | null }>;
  if (rows.length === 0) {
    return { ok: false, error: `Tag "${oldT}" tidak ditemukan` };
  }

  const updates = rows.map((r) => {
    const existing = r.tags ?? [];
    const next = Array.from(
      new Set(
        existing.filter((t) => t !== oldT).concat([newT]),
      ),
    );
    return supabase.from("contacts").update({ tags: next }).eq("id", r.id);
  });
  const results = await Promise.all(updates);
  const failed = results.filter((r) => r.error);
  if (failed.length > 0) {
    return { ok: false, error: failed[0].error?.message ?? "Update gagal" };
  }

  revalidatePath(`/w/${slug}/contacts/tags`);
  revalidatePath(`/w/${slug}/contacts`);
  return { ok: true, affected: rows.length };
}

/**
 * Merge multiple source tags into a target tag.
 * Source tags are removed from contacts; target is added (dedup).
 */
export async function mergeTags(
  slug: string,
  sourceNames: string[],
  targetName: string,
): Promise<Result> {
  const target = normalize(targetName);
  const sources = Array.from(
    new Set(sourceNames.map(normalize).filter((t) => t && t !== target)),
  );
  if (!target) return { ok: false, error: "Target tag kosong" };
  if (sources.length === 0) {
    return { ok: false, error: "Minimal pilih 1 source tag yang beda dari target" };
  }

  const { supabase, userId } = await authedClient();
  const { data, error: fetchErr } = await supabase
    .from("contacts")
    .select("id, tags")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .overlaps("tags", sources);
  if (fetchErr) return { ok: false, error: fetchErr.message };

  const rows = (data ?? []) as Array<{ id: string; tags: string[] | null }>;
  if (rows.length === 0) {
    return { ok: false, error: "Tidak ada kontak yang punya source tag" };
  }

  const sourceSet = new Set(sources);
  const updates = rows.map((r) => {
    const existing = r.tags ?? [];
    const next = Array.from(
      new Set(
        existing.filter((t) => !sourceSet.has(t)).concat([target]),
      ),
    );
    return supabase.from("contacts").update({ tags: next }).eq("id", r.id);
  });
  const results = await Promise.all(updates);
  const failed = results.filter((r) => r.error);
  if (failed.length > 0) {
    return { ok: false, error: failed[0].error?.message ?? "Update gagal" };
  }

  revalidatePath(`/w/${slug}/contacts/tags`);
  revalidatePath(`/w/${slug}/contacts`);
  return { ok: true, affected: rows.length };
}

/**
 * Remove a tag entirely from every contact that has it.
 */
export async function deleteTag(
  slug: string,
  name: string,
): Promise<Result> {
  const t = normalize(name);
  if (!t) return { ok: false, error: "Nama tag kosong" };

  const { supabase, userId } = await authedClient();
  const { data, error: fetchErr } = await supabase
    .from("contacts")
    .select("id, tags")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .contains("tags", [t]);
  if (fetchErr) return { ok: false, error: fetchErr.message };

  const rows = (data ?? []) as Array<{ id: string; tags: string[] | null }>;
  if (rows.length === 0) {
    return { ok: false, error: `Tag "${t}" tidak ditemukan` };
  }

  const updates = rows.map((r) => {
    const next = (r.tags ?? []).filter((x) => x !== t);
    return supabase.from("contacts").update({ tags: next }).eq("id", r.id);
  });
  const results = await Promise.all(updates);
  const failed = results.filter((r) => r.error);
  if (failed.length > 0) {
    return { ok: false, error: failed[0].error?.message ?? "Update gagal" };
  }

  revalidatePath(`/w/${slug}/contacts/tags`);
  revalidatePath(`/w/${slug}/contacts`);
  return { ok: true, affected: rows.length };
}
