"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug } from "@/lib/workspaces";

const ContactSchema = z.object({
  email: z.string().email("Email tidak valid"),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  company: z.string().optional(),
  position: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  notes: z.string().optional(),
  tags: z.string().optional(), // comma-separated
  priority: z.enum(["low", "medium", "high"]).optional(),
  lead_stage_id: z.string().optional(),
});

export type ContactFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
};

function parseTags(tagsStr: string | undefined): string[] {
  if (!tagsStr) return [];
  return tagsStr
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export async function createContact(
  slug: string,
  _prev: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) return { error: "Workspace not found" };

  const parsed = ContactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { fieldErrors };
  }

  const { tags, lead_stage_id, ...rest } = parsed.data;
  const tagsArray = parseTags(tags);

  const { data: contact, error } = await supabase
    .from("contacts")
    .insert({
      user_id: user.id,
      ...rest,
      tags: tagsArray,
      source: "manual",
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { fieldErrors: { email: "Email sudah ada di kontak" } };
    }
    return { error: error.message };
  }

  // Create contact_workspace_data row for this workspace
  await supabase.from("contact_workspace_data").insert({
    contact_id: contact.id,
    workspace_id: workspace.id,
    user_id: user.id,
    lead_stage_id: lead_stage_id ?? "new",
    lead_stage_updated_at: new Date().toISOString(),
  });

  revalidatePath(`/w/${slug}/contacts`);
  return { success: true };
}

export async function updateContact(
  id: string,
  slug: string,
  _prev: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) return { error: "Workspace not found" };

  const parsed = ContactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { fieldErrors };
  }

  const { tags, lead_stage_id, ...rest } = parsed.data;
  const tagsArray = parseTags(tags);

  const { error } = await supabase
    .from("contacts")
    .update({
      ...rest,
      tags: tagsArray,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  // Upsert workspace data + log stage change if it actually changed
  if (lead_stage_id) {
    const { data: prev } = await supabase
      .from("contact_workspace_data")
      .select("lead_stage_id")
      .eq("contact_id", id)
      .eq("workspace_id", workspace.id)
      .maybeSingle();

    await supabase
      .from("contact_workspace_data")
      .upsert(
        {
          contact_id: id,
          workspace_id: workspace.id,
          user_id: user.id,
          lead_stage_id,
          lead_stage_updated_at: new Date().toISOString(),
        },
        { onConflict: "contact_id,workspace_id" },
      );

    if (prev?.lead_stage_id !== lead_stage_id) {
      const stage = workspace.pipeline_stages.find(
        (s) => s.id === lead_stage_id,
      );
      await supabase.from("activity_log").insert({
        user_id: user.id,
        workspace_id: workspace.id,
        activity_type: "stage_changed",
        entity_type: "contact",
        entity_id: id,
        metadata: {
          new_stage_id: lead_stage_id,
          new_stage_name: stage?.name ?? lead_stage_id,
          previous_stage_id: prev?.lead_stage_id ?? null,
        },
      });
    }
  }

  revalidatePath(`/w/${slug}/contacts`);
  revalidatePath(`/w/${slug}/contacts/${id}`);
  return { success: true };
}

export async function updateContactNotes(
  contactId: string,
  slug: string,
  notes: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) return { ok: false, error: "Workspace not found" };

  const { error } = await supabase
    .from("contact_workspace_data")
    .upsert(
      {
        contact_id: contactId,
        workspace_id: workspace.id,
        user_id: user.id,
        workspace_notes: notes.length > 0 ? notes : null,
      },
      { onConflict: "contact_id,workspace_id" },
    );

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/w/${slug}/contacts/${contactId}`);
  return { ok: true };
}

export async function deleteContact(id: string, slug: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Soft delete
  await supabase
    .from("contacts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath(`/w/${slug}/contacts`);
}
