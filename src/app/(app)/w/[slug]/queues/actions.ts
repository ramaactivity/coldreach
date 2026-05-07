"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { runQueue } from "@/lib/queue-runner";
import {
  MAX_FOLLOWUP_STEPS,
  type FollowupStep,
} from "@/lib/queue-helpers";

const CreateQueueSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter").max(100),
  template_id: z.string().uuid("Pilih template"),
  audience_type: z.enum(["all", "tag"]),
  audience_tag: z.string().optional(),
  schedule_start_time: z.string().regex(/^\d{2}:\d{2}$/),
  schedule_end_time: z.string().regex(/^\d{2}:\d{2}$/),
  daily_target: z.coerce.number().int().min(1).max(500),
  use_ai_opener: z.coerce.boolean().optional().default(true),
  test_mode: z.coerce.boolean().optional().default(false),
});

export type CreateQueueState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
  queueId?: string;
};

export async function createQueue(
  slug: string,
  _prev: CreateQueueState,
  formData: FormData,
): Promise<CreateQueueState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) return { error: "Workspace not found" };

  const raw = {
    ...Object.fromEntries(formData),
    use_ai_opener: formData.get("use_ai_opener") === "on",
    test_mode: formData.get("test_mode") === "on",
  };
  const parsed = CreateQueueSchema.safeParse(raw);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { fieldErrors };
  }

  const data = parsed.data;
  const audienceFilter =
    data.audience_type === "tag"
      ? { type: "tag", tag: data.audience_tag ?? "" }
      : { type: "all" };

  // Resolve audience to contact IDs
  let contactQuery = supabase
    .from("contacts")
    .select("id")
    .is("deleted_at", null)
    .eq("status", "active");
  if (data.audience_type === "tag" && data.audience_tag) {
    contactQuery = contactQuery.contains("tags", [data.audience_tag]);
  }
  const { data: contactsRaw } = await contactQuery;
  if (!contactsRaw || contactsRaw.length === 0) {
    return {
      error:
        "Tidak ada kontak yang match audience ini. Tambah kontak atau ganti filter dulu.",
    };
  }
  // Fisher-Yates shuffle so each queue picks a different slice of the
  // shared pool, minimising overlap when multiple workspaces draw from
  // the same ~14k contacts.
  const contacts = [...contactsRaw];
  for (let i = contacts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [contacts[i], contacts[j]] = [contacts[j], contacts[i]];
  }

  // Create queue
  const { data: queue, error } = await supabase
    .from("send_queues")
    .insert({
      user_id: user.id,
      workspace_id: workspace.id,
      name: data.name,
      template_id: data.template_id,
      audience_filter: audienceFilter,
      is_active: true,
      schedule_start_time: `${data.schedule_start_time}:00`,
      schedule_end_time: `${data.schedule_end_time}:00`,
      daily_target: data.daily_target,
      use_ai_opener: data.use_ai_opener,
      test_mode: data.test_mode,
      total_in_queue: contacts.length,
      total_pending: contacts.length,
    })
    .select("id")
    .single();

  if (error || !queue) return { error: error?.message ?? "Gagal create queue" };

  // Bulk insert queue_recipients
  const BATCH = 500;
  for (let i = 0; i < contacts.length; i += BATCH) {
    const batch = contacts.slice(i, i + BATCH).map((c) => ({
      queue_id: queue.id,
      contact_id: c.id,
      user_id: user.id,
      workspace_id: workspace.id,
      status: "pending",
      priority: 0,
    }));
    await supabase.from("queue_recipients").insert(batch);
  }

  revalidatePath(`/w/${slug}/queues`);
  return { success: true, queueId: queue.id };
}

export async function pauseQueue(slug: string, queueId: string) {
  const supabase = await createClient();
  await supabase
    .from("send_queues")
    .update({
      is_active: false,
      paused_at: new Date().toISOString(),
      paused_reason: "Manually paused",
    })
    .eq("id", queueId);
  revalidatePath(`/w/${slug}/queues/${queueId}`);
  revalidatePath(`/w/${slug}/queues`);
}

export async function resumeQueue(slug: string, queueId: string) {
  const supabase = await createClient();
  await supabase
    .from("send_queues")
    .update({
      is_active: true,
      paused_at: null,
      paused_reason: null,
    })
    .eq("id", queueId);
  revalidatePath(`/w/${slug}/queues/${queueId}`);
  revalidatePath(`/w/${slug}/queues`);
}

export async function deleteQueueAction(slug: string, queueId: string) {
  const supabase = await createClient();
  // Hard delete the queue (queue_recipients cascade)
  await supabase.from("send_queues").delete().eq("id", queueId);
  revalidatePath(`/w/${slug}/queues`);
  redirect(`/w/${slug}/queues`);
}

const FollowupStepSchema = z.object({
  template_id: z.string().uuid(),
  after_days: z.coerce.number().int().min(1).max(60),
});

export async function updateFollowupSequence(
  slug: string,
  queueId: string,
  steps: FollowupStep[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ws = await getWorkspaceBySlug(slug);
  if (!ws) return { ok: false, error: "Workspace not found" };

  if (steps.length > MAX_FOLLOWUP_STEPS) {
    return { ok: false, error: `Maksimal ${MAX_FOLLOWUP_STEPS} step` };
  }
  const parsed = z.array(FollowupStepSchema).safeParse(steps);
  if (!parsed.success) {
    return { ok: false, error: "Step config invalid" };
  }

  const { data: queue } = await supabase
    .from("send_queues")
    .select("id, user_id")
    .eq("id", queueId)
    .maybeSingle();
  if (!queue || queue.user_id !== user.id) {
    return { ok: false, error: "Queue not found" };
  }

  // Sync legacy fields untuk compat: kalau steps ada, set followup_enabled+
  // template+days dari step pertama
  const first = parsed.data[0];
  const update: Record<string, unknown> = {
    followup_steps: parsed.data,
    followup_enabled: parsed.data.length > 0,
    followup_template_id: first?.template_id ?? null,
    followup_after_days: first?.after_days ?? 4,
  };

  const { error } = await supabase
    .from("send_queues")
    .update(update)
    .eq("id", queueId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/w/${slug}/queues/${queueId}`);
  revalidatePath(`/w/${slug}/queues`);
  return { ok: true };
}

export async function runNowAction(
  slug: string,
  queueId: string,
  batchSize: number = 1,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verify ownership before running
  const { data: queue } = await supabase
    .from("send_queues")
    .select("id, user_id")
    .eq("id", queueId)
    .maybeSingle();
  if (!queue || queue.user_id !== user.id) {
    return { error: "Unauthorized or queue not found" };
  }

  // applyDelay=false for manual runs to make testing fast
  const result = await runQueue(queueId, batchSize, false);
  revalidatePath(`/w/${slug}/queues/${queueId}`);
  return { result };
}
