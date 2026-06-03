"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import {
  apolloSearchPeople,
  apolloBulkMatch,
  type ApolloPerson,
  type ApolloSearchCriteria,
} from "@/lib/apollo";

export type DiscoverPerson = ApolloPerson & { alreadyImported: boolean };

export type SearchState = {
  error?: string;
  people?: DiscoverPerson[];
  page?: number;
  totalPages?: number;
  totalEntries?: number;
};

export type ImportResult = {
  error?: string;
  found?: number;
  deduped?: number;
  imported?: number;
  credits_used?: number;
  no_email?: number;
};

async function authWorkspace(slug: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const workspace = await getWorkspaceBySlug(slug);
  return { supabase, user, workspace };
}

/** Free People Search. Flags candidates already sourced (by apollo_id). */
export async function searchApollo(
  slug: string,
  criteria: ApolloSearchCriteria,
  page: number = 1,
): Promise<SearchState> {
  const { supabase, user, workspace } = await authWorkspace(slug);
  if (!workspace) return { error: "Workspace not found" };

  let res;
  try {
    res = await apolloSearchPeople(criteria, page);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Apollo search gagal" };
  }

  const ids = res.people.map((p) => p.id);
  const existing = new Set<string>();
  if (ids.length > 0) {
    const { data } = await supabase
      .from("contacts")
      .select("apollo_id")
      .eq("user_id", user.id)
      .in("apollo_id", ids);
    for (const r of data ?? []) {
      const a = (r as { apollo_id: string | null }).apollo_id;
      if (a) existing.add(a);
    }
  }

  return {
    people: res.people.map((p) => ({
      ...p,
      alreadyImported: existing.has(p.id),
    })),
    page: res.page,
    totalPages: res.totalPages,
    totalEntries: res.totalEntries,
  };
}

// Core: dedup by apollo_id → reveal → dedup/backfill by email → insert.
async function doImport(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  workspaceId: string,
  slug: string,
  apolloIds: string[],
): Promise<ImportResult> {
  const found = apolloIds.length;
  if (found === 0) return { found: 0, deduped: 0, imported: 0, credits_used: 0 };

  // 1. Dedup-first by apollo_id — never spend a reveal credit on a known person.
  const { data: known } = await supabase
    .from("contacts")
    .select("apollo_id")
    .eq("user_id", userId)
    .in("apollo_id", apolloIds);
  const knownIds = new Set(
    (known ?? []).map((r) => (r as { apollo_id: string }).apollo_id),
  );
  const newIds = apolloIds.filter((id) => !knownIds.has(id));
  let deduped = apolloIds.length - newIds.length;
  if (newIds.length === 0) {
    return { found, deduped, imported: 0, credits_used: 0 };
  }

  // 2. Reveal emails (paid).
  const matches = await apolloBulkMatch(newIds);
  const revealed = matches.filter((m) => m.email);
  const noEmail = newIds.length - revealed.length;
  const creditsUsed = revealed.length; // estimate: credit on successful reveal

  if (revealed.length === 0) {
    return { found, deduped, imported: 0, credits_used: 0, no_email: noEmail };
  }

  // 3. Dedup vs existing emails; backfill apollo_id on matches we already have.
  const emails = revealed.map((m) => m.email as string);
  const { data: existingByEmail } = await supabase
    .from("contacts")
    .select("id, email, apollo_id")
    .eq("user_id", userId)
    .in("email", emails);
  const existingEmail = new Map<string, { id: string; apollo_id: string | null }>();
  for (const r of existingByEmail ?? []) {
    const row = r as { id: string; email: string; apollo_id: string | null };
    existingEmail.set(row.email.toLowerCase(), { id: row.id, apollo_id: row.apollo_id });
  }

  const toInsert: Array<Record<string, unknown>> = [];
  for (const m of revealed) {
    const email = (m.email as string).toLowerCase();
    const hit = existingEmail.get(email);
    if (hit) {
      deduped++;
      // Backfill apollo_id so future searches dedup this for free.
      if (!hit.apollo_id && m.id) {
        await supabase
          .from("contacts")
          .update({ apollo_id: m.id })
          .eq("id", hit.id);
      }
      continue;
    }
    toInsert.push({
      user_id: userId,
      email,
      apollo_id: m.id,
      first_name: m.first_name,
      last_name: m.last_name,
      company: m.organization_name,
      position: m.title,
      website: m.organization_website,
      tags: ["apollo"],
      source: "apollo",
    });
  }

  let imported = 0;
  if (toInsert.length > 0) {
    const { data: inserted } = await supabase
      .from("contacts")
      .upsert(toInsert, { onConflict: "user_id,email", ignoreDuplicates: true })
      .select("id");
    const ids = (inserted ?? []).map((r) => (r as { id: string }).id);
    imported = ids.length;
    if (ids.length > 0) {
      await supabase.from("contact_workspace_data").upsert(
        ids.map((id) => ({
          contact_id: id,
          workspace_id: workspaceId,
          user_id: userId,
          lead_stage_id: "new",
          lead_stage_updated_at: new Date().toISOString(),
        })),
        { onConflict: "contact_id,workspace_id", ignoreDuplicates: true },
      );
    }
  }

  // Log credit spend for the workspace stat card + reminder.
  if (creditsUsed > 0) {
    await supabase.from("activity_log").insert({
      user_id: userId,
      workspace_id: workspaceId,
      activity_type: "apollo_credits_used",
      entity_type: "contacts",
      metadata: { count: creditsUsed, imported, found },
    });
  }

  revalidatePath(`/w/${slug}/contacts`);
  revalidatePath(`/w/${slug}/dashboard`);
  return { found, deduped, imported, credits_used: creditsUsed, no_email: noEmail };
}

/** Import selected candidates by Apollo id. */
export async function importApollo(
  slug: string,
  apolloIds: string[],
): Promise<ImportResult> {
  const { supabase, user, workspace } = await authWorkspace(slug);
  if (!workspace) return { error: "Workspace not found" };
  if (!apolloIds.length) return { error: "Pilih minimal 1 kontak" };
  try {
    return await doImport(supabase, user.id, workspace.id, slug, apolloIds);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Import gagal" };
  }
}

/** Quick mode: search → take first N not-yet-sourced → import. */
export async function quickImportApollo(
  slug: string,
  criteria: ApolloSearchCriteria,
  n: number,
): Promise<ImportResult> {
  const { supabase, user, workspace } = await authWorkspace(slug);
  if (!workspace) return { error: "Workspace not found" };
  const want = Math.min(100, Math.max(1, Math.floor(n)));

  try {
    const res = await apolloSearchPeople(
      { ...criteria, perPage: Math.min(100, want * 2) },
      1,
    );
    const ids = res.people.map((p) => p.id);
    if (ids.length === 0) return { found: 0, deduped: 0, imported: 0, credits_used: 0 };
    const { data: known } = await supabase
      .from("contacts")
      .select("apollo_id")
      .eq("user_id", user.id)
      .in("apollo_id", ids);
    const knownIds = new Set(
      (known ?? []).map((r) => (r as { apollo_id: string }).apollo_id),
    );
    const pick = ids.filter((id) => !knownIds.has(id)).slice(0, want);
    return await doImport(supabase, user.id, workspace.id, slug, pick);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Quick import gagal" };
  }
}

/** Manual baseline correction for the credit estimate. */
export async function syncApolloCredits(
  slug: string,
  remaining: number,
): Promise<{ error?: string; ok?: boolean }> {
  const { supabase, user, workspace } = await authWorkspace(slug);
  if (!workspace) return { error: "Workspace not found" };
  const val = Math.max(0, Math.floor(remaining));
  const { error } = await supabase
    .from("users")
    .update({
      apollo_credits_synced_remaining: val,
      apollo_credits_synced_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (error) return { error: error.message };
  revalidatePath(`/w/${slug}/dashboard`);
  revalidatePath(`/w/${slug}/contacts/discover`);
  return { ok: true };
}
