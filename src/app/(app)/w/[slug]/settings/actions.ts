"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug, WORKSPACE_CACHE_TAG } from "@/lib/workspaces";
import type { PipelineStage, CustomField } from "@/lib/workspace-constants";
import type { SignatureData, SignatureSocial, SocialPlatform } from "@/lib/signature";

export async function disconnectGmail(slug: string, accountId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("email_accounts")
    .update({
      workspace_id: null,
      is_active: false,
      health_status: "needs_reconnect",
    })
    .eq("id", accountId)
    .eq("user_id", user.id);

  revalidatePath(`/w/${slug}/settings`);
}

export async function toggleWarmupMode(
  slug: string,
  accountId: string,
  enabled: boolean,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const updates: Record<string, unknown> = {
    warmup_mode: enabled,
  };
  if (enabled) {
    updates.warmup_started_at = new Date().toISOString();
    updates.daily_quota = 5;
  } else {
    updates.warmup_started_at = null;
    updates.daily_quota = 30;
  }

  await supabase
    .from("email_accounts")
    .update(updates)
    .eq("id", accountId)
    .eq("user_id", user.id);

  revalidatePath(`/w/${slug}/settings`);
}

// =============================================================================
// Workspace info update
// =============================================================================

const WorkspaceInfoSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter").max(50),
  business_type: z
    .enum(["catering", "photography", "design", "consulting", "other"])
    .optional(),
  color_theme: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color invalid"),
});

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
};

export async function updateWorkspaceInfo(
  slug: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) return { error: "Workspace not found" };

  const parsed = WorkspaceInfoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { fieldErrors };
  }

  const { error } = await supabase
    .from("workspaces")
    .update({
      name: parsed.data.name,
      business_type: parsed.data.business_type || null,
      color_theme: parsed.data.color_theme,
    })
    .eq("id", workspace.id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath(`/w/${slug}/settings`);
  revalidatePath(`/w/${slug}/dashboard`);
  updateTag(WORKSPACE_CACHE_TAG);
  return { success: true };
}

// =============================================================================
// Signature update — structured payload (name, contacts, socials, logo).
// Renderers in src/lib/signature.ts turn this into HTML + plain text at send.
// =============================================================================

const SOCIAL_PLATFORMS = [
  "instagram", "facebook", "linkedin", "twitter",
  "youtube", "tiktok", "threads", "pinterest", "custom",
] as const;

const SocialSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  url: z.string().trim().min(1).max(500),
  label: z.string().trim().max(80).optional(),
});

const SignatureDataSchema = z.object({
  name: z.string().trim().max(120).optional(),
  title: z.string().trim().max(120).optional(),
  company: z.string().trim().max(120).optional(),
  email: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  whatsapp: z.string().trim().max(40).optional(),
  website: z.string().trim().max(200).optional(),
  logo_url: z.string().trim().max(500).optional(),
  brand_color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Format hex, e.g. #f59e0b")
    .optional(),
  tagline: z.string().trim().max(120).optional(),
  socials: z.array(SocialSchema).max(10).optional(),
});

/** Strip empty strings so we don't persist {name: "", title: "", ...} junk. */
function cleanSignaturePayload(raw: z.infer<typeof SignatureDataSchema>): SignatureData | null {
  const out: SignatureData = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === "socials") continue;
    if (typeof v === "string" && v.length > 0) {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  const socials = (raw.socials ?? [])
    .filter((s) => s.url && s.url.trim().length > 0)
    .map<SignatureSocial>((s) => ({
      platform: s.platform as SocialPlatform,
      url: s.url.trim(),
      ...(s.label && s.label.length > 0 ? { label: s.label } : {}),
    }));
  if (socials.length > 0) out.socials = socials;
  const hasAny =
    Object.keys(out).some((k) => k !== "socials") || socials.length > 0;
  return hasAny ? out : null;
}

export async function updateWorkspaceSignature(
  slug: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) return { error: "Workspace not found" };

  // Client posts a single JSON blob under `payload` for atomic save —
  // socials array doesn't fit cleanly in FormData primitives.
  const rawPayload = formData.get("payload");
  if (typeof rawPayload !== "string") {
    return { error: "Missing signature payload" };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return { error: "Signature payload is not valid JSON" };
  }
  const parsed = SignatureDataSchema.safeParse(payload);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] = issue.message;
    }
    return { fieldErrors };
  }

  const cleaned = cleanSignaturePayload(parsed.data);
  const { error } = await supabase
    .from("workspaces")
    .update({ signature_data: cleaned })
    .eq("id", workspace.id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath(`/w/${slug}/settings`);
  updateTag(WORKSPACE_CACHE_TAG);
  return { success: true };
}

// =============================================================================
// Logo upload / remove — stored in workspace-logos public bucket under
// {user_id}/{workspace_id}/logo.{ext}. RLS lets only the owner overwrite.
// =============================================================================

const ALLOWED_LOGO_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const MAX_LOGO_BYTES = 512 * 1024; // matches bucket file_size_limit

function logoExtForMime(mime: string): string {
  switch (mime) {
    case "image/png": return "png";
    case "image/jpeg": return "jpg";
    case "image/webp": return "webp";
    case "image/gif": return "gif";
    default: return "png";
  }
}

export async function uploadWorkspaceLogo(
  slug: string,
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) return { ok: false, error: "Workspace not found" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file uploaded" };
  if (!ALLOWED_LOGO_MIMES.has(file.type)) {
    return { ok: false, error: "Format harus PNG / JPG / WebP / GIF" };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { ok: false, error: "Maksimal 512 KB" };
  }

  const ext = logoExtForMime(file.type);
  // Single filename per workspace so re-upload replaces in place. We bust
  // the email-client cache via a ?v=timestamp query param on the public URL.
  const path = `${user.id}/${workspace.id}/logo.${ext}`;
  const bytes = await file.arrayBuffer();

  const { error: uploadErr } = await supabase.storage
    .from("workspace-logos")
    .upload(path, bytes, {
      contentType: file.type,
      upsert: true,
      cacheControl: "3600",
    });
  if (uploadErr) return { ok: false, error: uploadErr.message };

  const { data: pub } = supabase.storage
    .from("workspace-logos")
    .getPublicUrl(path);
  const url = `${pub.publicUrl}?v=${Date.now()}`;

  revalidatePath(`/w/${slug}/settings`);
  updateTag(WORKSPACE_CACHE_TAG);
  return { ok: true, url };
}

export async function removeWorkspaceLogo(
  slug: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) return { ok: false, error: "Workspace not found" };

  // Try removing all known extensions — we don't track which one was used.
  const prefix = `${user.id}/${workspace.id}/`;
  const paths = ["png", "jpg", "webp", "gif"].map((e) => `${prefix}logo.${e}`);
  const { error } = await supabase.storage.from("workspace-logos").remove(paths);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/w/${slug}/settings`);
  updateTag(WORKSPACE_CACHE_TAG);
  return { ok: true };
}

// =============================================================================
// Schedule update
// =============================================================================

// Daily volume (Target/hari) is NOT part of this form anymore — it's unified
// with the Gmail account's daily_quota and edited there. This form owns only
// WHEN to send (days + window).
const ScheduleSchema = z.object({
  schedule_days: z.string(), // CSV of day numbers
  schedule_start_time: z.string().regex(/^\d{2}:\d{2}$/),
  schedule_end_time: z.string().regex(/^\d{2}:\d{2}$/),
});

export async function updateWorkspaceSchedule(
  slug: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) return { error: "Workspace not found" };

  const parsed = ScheduleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { fieldErrors };
  }

  const dayNums = parsed.data.schedule_days
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 7);

  if (dayNums.length === 0) {
    return {
      fieldErrors: { schedule_days: "Pilih minimal 1 hari" },
    };
  }
  if (parsed.data.schedule_start_time >= parsed.data.schedule_end_time) {
    return {
      fieldErrors: {
        schedule_end_time: "Sampai jam harus setelah Mulai jam",
      },
    };
  }

  const startTime = `${parsed.data.schedule_start_time}:00`;
  const endTime = `${parsed.data.schedule_end_time}:00`;

  const { error } = await supabase
    .from("workspaces")
    .update({
      schedule_days: dayNums,
      schedule_start_time: startTime,
      schedule_end_time: endTime,
    })
    .eq("id", workspace.id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  // Single source of truth: the workspace schedule IS the schedule. Push it
  // down to every recurring queue in this workspace so the cron runner (which
  // reads per-queue schedule, not the workspace default) actually obeys it.
  // Without this, editing the schedule here silently no-ops on existing queues
  // — they keep whatever window they were created with. One-shot campaigns are
  // excluded: they ignore the recurring window and have their own start time.
  // Also re-aligns daily_target to the workspace value (kept = Gmail quota) so
  // a queue can't drift below the account cap.
  const { error: propagateError } = await supabase
    .from("send_queues")
    .update({
      schedule_days: dayNums,
      schedule_start_time: startTime,
      schedule_end_time: endTime,
      daily_target: workspace.daily_target,
    })
    .eq("workspace_id", workspace.id)
    .eq("user_id", user.id)
    .eq("is_one_shot", false);

  if (propagateError) return { error: propagateError.message };

  revalidatePath(`/w/${slug}/settings`);
  revalidatePath(`/w/${slug}/dashboard`);
  updateTag(WORKSPACE_CACHE_TAG);
  return { success: true };
}

// =============================================================================
// Gmail daily quota update
// =============================================================================

const QuotaSchema = z.object({
  daily_quota: z.coerce.number().int().min(1).max(500),
});

export async function updateGmailQuota(
  slug: string,
  accountId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = QuotaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { fieldErrors };
  }

  const quota = parsed.data.daily_quota;

  const { error } = await supabase
    .from("email_accounts")
    .update({ daily_quota: quota })
    .eq("id", accountId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  // The Gmail quota is the single source of truth for daily send volume
  // ("Target/hari" was merged into this). Mirror it onto the workspace default
  // (seeds new queues + dashboard) and onto every recurring queue's
  // daily_target (what the cron runner actually paces to), so all three stay
  // in lockstep instead of silently drifting apart.
  const workspace = await getWorkspaceBySlug(slug);
  if (workspace) {
    await supabase
      .from("workspaces")
      .update({ daily_target: quota })
      .eq("id", workspace.id)
      .eq("user_id", user.id);

    await supabase
      .from("send_queues")
      .update({ daily_target: quota })
      .eq("workspace_id", workspace.id)
      .eq("user_id", user.id)
      .eq("is_one_shot", false);

    updateTag(WORKSPACE_CACHE_TAG);
  }

  revalidatePath(`/w/${slug}/settings`);
  revalidatePath(`/w/${slug}/dashboard`);
  return { success: true };
}

// =============================================================================
// Pipeline stages update
// =============================================================================

const PipelineStageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  order: z.number().int(),
  is_default: z.boolean().optional(),
  is_terminal: z.boolean().optional(),
});

const PipelineStagesPayloadSchema = z.object({
  stages: z.array(PipelineStageSchema).min(1).max(20),
});

export async function updatePipelineStages(
  slug: string,
  stages: PipelineStage[],
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) return { error: "Workspace not found" };

  const parsed = PipelineStagesPayloadSchema.safeParse({ stages });
  if (!parsed.success) {
    return { error: "Pipeline data invalid" };
  }

  // Ensure unique IDs
  const ids = parsed.data.stages.map((s) => s.id);
  if (new Set(ids).size !== ids.length) {
    return { error: "Stage ID harus unique" };
  }

  // Re-index order based on array position
  const ordered = parsed.data.stages.map((s, i) => ({ ...s, order: i + 1 }));

  const { error } = await supabase
    .from("workspaces")
    .update({ pipeline_stages: ordered })
    .eq("id", workspace.id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath(`/w/${slug}/settings`);
  revalidatePath(`/w/${slug}/pipeline`);
  updateTag(WORKSPACE_CACHE_TAG);
  return { success: true };
}

// =============================================================================
// Custom fields schema update
// =============================================================================

const FieldTypeEnum = z.enum(["text", "number", "date", "select", "textarea"]);

const CustomFieldSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_]+$/, "id harus lowercase + underscore"),
  label: z.string().min(1).max(60),
  type: FieldTypeEnum,
  options: z.array(z.string()).optional(),
  required: z.boolean().optional(),
  hint: z.string().max(200).optional(),
});

const CustomFieldsSchema = z.object({
  fields: z.array(CustomFieldSchema).max(20),
});

export async function updateCustomFieldsSchema(
  slug: string,
  fields: CustomField[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) return { ok: false, error: "Workspace not found" };

  const parsed = CustomFieldsSchema.safeParse({ fields });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }

  // Enforce unique ids
  const ids = new Set<string>();
  for (const f of parsed.data.fields) {
    if (ids.has(f.id)) {
      return { ok: false, error: `Duplicate field id: ${f.id}` };
    }
    ids.add(f.id);
    if (f.type === "select" && (!f.options || f.options.length === 0)) {
      return { ok: false, error: `Select "${f.label}" butuh minimal 1 option` };
    }
  }

  const { error } = await supabase
    .from("workspaces")
    .update({ custom_fields_schema: parsed.data.fields })
    .eq("id", workspace.id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/w/${slug}/settings`);
  revalidatePath(`/w/${slug}/contacts`);
  updateTag(WORKSPACE_CACHE_TAG);
  return { ok: true };
}
