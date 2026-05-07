"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug } from "@/lib/workspaces";

const ContactSchema = z.object({
  email: z.string().email("Email tidak valid"),
  alt_emails: z.string().optional(), // comma-separated
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

const SingleEmailSchema = z.string().email();

function parseAltEmails(
  raw: string | undefined,
  primary: string,
): { ok: string[]; invalid: string[] } {
  if (!raw) return { ok: [], invalid: [] };
  const ok: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>([primary.toLowerCase()]);
  for (const part of raw.split(/[,;]/)) {
    const v = part.trim().toLowerCase();
    if (!v) continue;
    if (seen.has(v)) continue;
    if (!SingleEmailSchema.safeParse(v).success) {
      invalid.push(v);
      continue;
    }
    ok.push(v);
    seen.add(v);
  }
  return { ok, invalid };
}

export type ContactFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
};

/**
 * Pull `cf_<id>` form fields, coerce by schema type, return a record.
 * Skips empty values so they don't overwrite existing JSONB entries.
 */
function parseCustomFieldValues(
  formData: FormData,
  schema: Array<{ id: string; type: string }>,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const f of schema) {
    const raw = formData.get(`cf_${f.id}`);
    if (raw === null) continue;
    const str = String(raw).trim();
    if (str === "") continue;
    if (f.type === "number") {
      const n = Number(str);
      if (!Number.isNaN(n)) out[f.id] = n;
    } else {
      out[f.id] = str;
    }
  }
  return out;
}

/**
 * Merge custom field values into existing contact.custom_fields without
 * touching keys defined by other workspaces' schemas. Workspace-defined
 * keys are replaced (so clearing a field actually removes it).
 */
function mergeCustomFields(
  current: Record<string, unknown>,
  workspaceSchemaKeys: string[],
  newValues: Record<string, string | number>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current };
  for (const k of workspaceSchemaKeys) delete next[k];
  for (const [k, v] of Object.entries(newValues)) next[k] = v;
  return next;
}

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

  const { tags, lead_stage_id, alt_emails, ...rest } = parsed.data;
  const tagsArray = parseTags(tags);
  const altParsed = parseAltEmails(alt_emails, parsed.data.email);
  if (altParsed.invalid.length > 0) {
    return {
      fieldErrors: {
        alt_emails: `Email invalid: ${altParsed.invalid.join(", ")}`,
      },
    };
  }

  const cfSchema = workspace.custom_fields_schema ?? [];
  const cfValues = parseCustomFieldValues(formData, cfSchema);

  const { data: contact, error } = await supabase
    .from("contacts")
    .insert({
      user_id: user.id,
      ...rest,
      alt_emails: altParsed.ok,
      tags: tagsArray,
      custom_fields: cfValues,
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

  const { tags, lead_stage_id, alt_emails, ...rest } = parsed.data;
  const tagsArray = parseTags(tags);
  const altParsed = parseAltEmails(alt_emails, parsed.data.email);
  if (altParsed.invalid.length > 0) {
    return {
      fieldErrors: {
        alt_emails: `Email invalid: ${altParsed.invalid.join(", ")}`,
      },
    };
  }

  // Merge custom fields without clobbering keys from other workspaces
  const cfSchema = workspace.custom_fields_schema ?? [];
  const cfValues = parseCustomFieldValues(formData, cfSchema);
  const { data: existing } = await supabase
    .from("contacts")
    .select("custom_fields")
    .eq("id", id)
    .maybeSingle();
  const currentCustom = (existing?.custom_fields ?? {}) as Record<
    string,
    unknown
  >;
  const mergedCustom = mergeCustomFields(
    currentCustom,
    cfSchema.map((f) => f.id),
    cfValues,
  );

  const { error } = await supabase
    .from("contacts")
    .update({
      ...rest,
      alt_emails: altParsed.ok,
      tags: tagsArray,
      custom_fields: mergedCustom,
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

/**
 * Archive a contact: stops every workspace from emailing them while keeping
 * the row + history intact. Sets archive_reason='manual' so it's clear the
 * user did this (vs the bounce-detector). Also flips any pending
 * queue_recipients to 'skipped' so the cron doesn't waste a tick on them.
 */
export async function archiveContact(id: string, slug: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("contacts")
    .update({
      archived_at: new Date().toISOString(),
      archive_reason: "manual",
    })
    .eq("id", id)
    .eq("user_id", user.id);

  await supabase
    .from("queue_recipients")
    .update({ status: "skipped" })
    .eq("contact_id", id)
    .eq("status", "pending");

  revalidatePath(`/w/${slug}/contacts`);
  revalidatePath(`/w/${slug}/contacts/${id}`);
  return { ok: true };
}

/** Reverse archiveContact: brings the contact back into the active pool. */
export async function unarchiveContact(id: string, slug: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("contacts")
    .update({
      archived_at: null,
      archive_reason: null,
      // Best-effort restore to active. If the contact was hard-bounced we
      // intentionally do NOT bump bounce_count back to 0 — that history is
      // useful for spotting repeat offenders.
      status: "active",
    })
    .eq("id", id)
    .eq("user_id", user.id);

  revalidatePath(`/w/${slug}/contacts`);
  revalidatePath(`/w/${slug}/contacts/${id}`);
  return { ok: true };
}
