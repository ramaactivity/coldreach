"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

async function getUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user.id;
}

function paths(slug: string | null) {
  if (slug) return [`/w/${slug}/inbox`, `/w/${slug}/dashboard`, "/inbox", "/dashboard"];
  return ["/inbox", "/dashboard"];
}

export async function markHandled(
  recipientId: string,
  slug: string | null,
): Promise<Result> {
  await getUserId();
  const supabase = await createClient();
  const { error } = await supabase
    .from("campaign_recipients")
    .update({ handled_at: new Date().toISOString() })
    .eq("id", recipientId);
  if (error) return { ok: false, error: error.message };
  for (const p of paths(slug)) revalidatePath(p);
  return { ok: true };
}

export async function unmarkHandled(
  recipientId: string,
  slug: string | null,
): Promise<Result> {
  await getUserId();
  const supabase = await createClient();
  const { error } = await supabase
    .from("campaign_recipients")
    .update({ handled_at: null })
    .eq("id", recipientId);
  if (error) return { ok: false, error: error.message };
  for (const p of paths(slug)) revalidatePath(p);
  return { ok: true };
}

export async function snoozeReply(
  recipientId: string,
  hours: number,
  slug: string | null,
): Promise<Result> {
  await getUserId();
  const ms = Math.max(1, Math.floor(hours)) * 3600 * 1000;
  const until = new Date(Date.now() + ms).toISOString();
  const supabase = await createClient();
  const { error } = await supabase
    .from("campaign_recipients")
    .update({ snoozed_until: until })
    .eq("id", recipientId);
  if (error) return { ok: false, error: error.message };
  for (const p of paths(slug)) revalidatePath(p);
  return { ok: true };
}

export async function unsnooze(
  recipientId: string,
  slug: string | null,
): Promise<Result> {
  await getUserId();
  const supabase = await createClient();
  const { error } = await supabase
    .from("campaign_recipients")
    .update({ snoozed_until: null })
    .eq("id", recipientId);
  if (error) return { ok: false, error: error.message };
  for (const p of paths(slug)) revalidatePath(p);
  return { ok: true };
}

export async function updateInboxStage(
  contactId: string,
  workspaceId: string,
  stageId: string,
  slug: string | null,
): Promise<Result> {
  const userId = await getUserId();
  const supabase = await createClient();
  // Confirm the caller owns this workspace before writing a cwd row for it —
  // workspaceId arrives from the client and RLS (user_id = auth.uid()) would
  // still pass for a row carrying the caller's own id, so verify explicitly.
  const { data: ws } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!ws) return { ok: false, error: "Workspace tidak ditemukan" };
  const { error } = await supabase
    .from("contact_workspace_data")
    .upsert(
      {
        contact_id: contactId,
        workspace_id: workspaceId,
        user_id: userId,
        lead_stage_id: stageId,
        lead_stage_updated_at: new Date().toISOString(),
      },
      { onConflict: "contact_id,workspace_id" },
    );
  if (error) return { ok: false, error: error.message };
  for (const p of paths(slug)) revalidatePath(p);
  if (slug) revalidatePath(`/w/${slug}/contacts/${contactId}`);
  return { ok: true };
}
