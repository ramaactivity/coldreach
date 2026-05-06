"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Result =
  | { ok: true; mergedInto: string }
  | { ok: false; error: string };

type ContactRow = {
  id: string;
  user_id: string;
  email: string;
  alt_emails: string[] | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  position: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  tags: string[] | null;
  custom_fields: Record<string, unknown> | null;
  source: string | null;
};

type WorkspaceData = {
  contact_id: string;
  workspace_id: string;
  user_id: string;
  lead_stage_id: string | null;
  workspace_notes: string | null;
  total_emails_sent: number | null;
  total_emails_opened: number | null;
  total_replies: number | null;
  last_contacted_at: string | null;
};

function unionStr(a: string[] | null, b: string[] | null): string[] {
  const set = new Set<string>();
  for (const x of a ?? []) if (x) set.add(x.toLowerCase());
  for (const x of b ?? []) if (x) set.add(x.toLowerCase());
  return Array.from(set);
}

function preferFirst<T>(a: T | null | undefined, b: T | null | undefined): T | null {
  if (a !== null && a !== undefined && a !== "") return a as T;
  if (b !== null && b !== undefined && b !== "") return b as T;
  return null;
}

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

/**
 * Merge `secondaryId` into `primaryId`. Both contacts must belong to the
 * authenticated user. After this operation:
 *
 *   - `primary` keeps its id + primary email (used for sending)
 *   - secondary's primary email is appended to primary's alt_emails
 *   - tags are union, alt_emails are union, custom_fields are merged
 *     (primary wins on key collision), notes are concatenated
 *   - empty fields on primary (phone / website / first_name / etc.) are
 *     filled from secondary
 *   - per-workspace data is merged: stats summed, primary's lead_stage_id
 *     wins, last_contacted_at = max
 *   - campaign_recipients + queue_recipients are re-pointed to primary
 *     where there's no conflict (UNIQUE constraint); conflicting rows
 *     are left on secondary and effectively orphaned by the soft-delete
 *   - secondary is soft-deleted (deleted_at set)
 */
export async function mergeContacts(
  slug: string,
  primaryId: string,
  secondaryId: string,
): Promise<Result> {
  if (primaryId === secondaryId) {
    return { ok: false, error: "Primary dan secondary harus beda kontak" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch both with ownership check
  const { data, error: fetchErr } = await supabase
    .from("contacts")
    .select(
      "id, user_id, email, alt_emails, first_name, last_name, company, position, phone, website, notes, tags, custom_fields, source",
    )
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .in("id", [primaryId, secondaryId]);

  if (fetchErr) return { ok: false, error: fetchErr.message };
  const rows = (data ?? []) as ContactRow[];
  const primary = rows.find((r) => r.id === primaryId);
  const secondary = rows.find((r) => r.id === secondaryId);
  if (!primary || !secondary) {
    return { ok: false, error: "Kontak tidak ditemukan atau bukan milik lu" };
  }

  // Build merged contact fields
  const newAltEmails = Array.from(
    new Set(
      [
        ...(primary.alt_emails ?? []),
        secondary.email,
        ...(secondary.alt_emails ?? []),
      ]
        .map((e) => e.toLowerCase())
        .filter((e) => e && e !== primary.email.toLowerCase()),
    ),
  );

  const newTags = unionStr(primary.tags, secondary.tags);

  const mergedNotes = (() => {
    const a = (primary.notes ?? "").trim();
    const b = (secondary.notes ?? "").trim();
    if (!a && !b) return null;
    if (!b) return a;
    if (!a) return b;
    return `${a}\n\n--- merged dari ${secondary.email} ---\n${b}`;
  })();

  const mergedCustomFields = {
    ...(secondary.custom_fields ?? {}),
    ...(primary.custom_fields ?? {}),
  };

  const update: Record<string, unknown> = {
    alt_emails: newAltEmails,
    tags: newTags,
    notes: mergedNotes,
    custom_fields: mergedCustomFields,
    first_name: preferFirst(primary.first_name, secondary.first_name),
    last_name: preferFirst(primary.last_name, secondary.last_name),
    company: preferFirst(primary.company, secondary.company),
    position: preferFirst(primary.position, secondary.position),
    phone: preferFirst(primary.phone, secondary.phone),
    website: preferFirst(primary.website, secondary.website),
  };

  const { error: updErr } = await supabase
    .from("contacts")
    .update(update)
    .eq("id", primaryId);
  if (updErr) return { ok: false, error: updErr.message };

  // Merge contact_workspace_data per workspace
  const { data: wsRows } = await supabase
    .from("contact_workspace_data")
    .select(
      "contact_id, workspace_id, user_id, lead_stage_id, workspace_notes, total_emails_sent, total_emails_opened, total_replies, last_contacted_at",
    )
    .eq("user_id", user.id)
    .in("contact_id", [primaryId, secondaryId]);

  const wsList = (wsRows ?? []) as WorkspaceData[];
  const wsByWorkspace = new Map<
    string,
    { primary?: WorkspaceData; secondary?: WorkspaceData }
  >();
  for (const r of wsList) {
    const key = r.workspace_id;
    const slot = wsByWorkspace.get(key) ?? {};
    if (r.contact_id === primaryId) slot.primary = r;
    else slot.secondary = r;
    wsByWorkspace.set(key, slot);
  }

  for (const [workspaceId, pair] of wsByWorkspace) {
    if (pair.primary && pair.secondary) {
      // Merge into primary's row
      const merged = {
        contact_id: primaryId,
        workspace_id: workspaceId,
        user_id: user.id,
        lead_stage_id:
          pair.primary.lead_stage_id ?? pair.secondary.lead_stage_id,
        workspace_notes: (() => {
          const a = (pair.primary.workspace_notes ?? "").trim();
          const b = (pair.secondary.workspace_notes ?? "").trim();
          if (!a && !b) return null;
          if (!b) return a;
          if (!a) return b;
          return `${a}\n\n--- merged ---\n${b}`;
        })(),
        total_emails_sent:
          (pair.primary.total_emails_sent ?? 0) +
          (pair.secondary.total_emails_sent ?? 0),
        total_emails_opened:
          (pair.primary.total_emails_opened ?? 0) +
          (pair.secondary.total_emails_opened ?? 0),
        total_replies:
          (pair.primary.total_replies ?? 0) +
          (pair.secondary.total_replies ?? 0),
        last_contacted_at: maxIso(
          pair.primary.last_contacted_at,
          pair.secondary.last_contacted_at,
        ),
      };
      await supabase
        .from("contact_workspace_data")
        .upsert(merged, { onConflict: "contact_id,workspace_id" });
      // Drop secondary's row
      await supabase
        .from("contact_workspace_data")
        .delete()
        .eq("contact_id", secondaryId)
        .eq("workspace_id", workspaceId);
    } else if (pair.secondary) {
      // Secondary has it, primary doesn't — re-point to primary
      await supabase
        .from("contact_workspace_data")
        .update({ contact_id: primaryId })
        .eq("contact_id", secondaryId)
        .eq("workspace_id", workspaceId);
    }
    // If only primary: nothing to do
  }

  // Re-point campaign_recipients (UNIQUE on (campaign_id, contact_id) — skip conflicts)
  const { data: secondaryCRs } = await supabase
    .from("campaign_recipients")
    .select("id, campaign_id")
    .eq("contact_id", secondaryId);
  for (const cr of (secondaryCRs ?? []) as Array<{
    id: string;
    campaign_id: string | null;
  }>) {
    if (!cr.campaign_id) {
      // Manual / followup CR (no campaign) — safe to re-point
      await supabase
        .from("campaign_recipients")
        .update({ contact_id: primaryId })
        .eq("id", cr.id);
      continue;
    }
    // Check if primary already has a CR for this campaign
    const { data: clash } = await supabase
      .from("campaign_recipients")
      .select("id")
      .eq("campaign_id", cr.campaign_id)
      .eq("contact_id", primaryId)
      .maybeSingle();
    if (!clash) {
      await supabase
        .from("campaign_recipients")
        .update({ contact_id: primaryId })
        .eq("id", cr.id);
    }
    // else: leave on secondary; will be effectively orphaned by soft-delete
  }

  // Re-point queue_recipients (no UNIQUE constraint expected)
  await supabase
    .from("queue_recipients")
    .update({ contact_id: primaryId })
    .eq("contact_id", secondaryId);

  // Soft-delete secondary
  const { error: delErr } = await supabase
    .from("contacts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", secondaryId);
  if (delErr) return { ok: false, error: delErr.message };

  // Activity log
  await supabase.from("activity_log").insert({
    user_id: user.id,
    activity_type: "contact_merged",
    entity_type: "contact",
    entity_id: primaryId,
    metadata: {
      secondary_id: secondaryId,
      secondary_email: secondary.email,
    },
  });

  revalidatePath(`/w/${slug}/contacts/duplicates`);
  revalidatePath(`/w/${slug}/contacts`);
  revalidatePath(`/w/${slug}/contacts/${primaryId}`);

  return { ok: true, mergedInto: primaryId };
}
