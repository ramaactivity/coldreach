"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import type { PipelineStage } from "@/lib/workspace-constants";

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
  return { success: true };
}

// =============================================================================
// Schedule update
// =============================================================================

const ScheduleSchema = z.object({
  schedule_days: z.string(), // CSV of day numbers
  schedule_start_time: z.string().regex(/^\d{2}:\d{2}$/),
  schedule_end_time: z.string().regex(/^\d{2}:\d{2}$/),
  daily_target: z.coerce.number().int().min(1).max(500),
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

  const { error } = await supabase
    .from("workspaces")
    .update({
      schedule_days: dayNums,
      schedule_start_time: `${parsed.data.schedule_start_time}:00`,
      schedule_end_time: `${parsed.data.schedule_end_time}:00`,
      daily_target: parsed.data.daily_target,
    })
    .eq("id", workspace.id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath(`/w/${slug}/settings`);
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

  const { error } = await supabase
    .from("email_accounts")
    .update({ daily_quota: parsed.data.daily_quota })
    .eq("id", accountId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath(`/w/${slug}/settings`);
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
  return { success: true };
}
