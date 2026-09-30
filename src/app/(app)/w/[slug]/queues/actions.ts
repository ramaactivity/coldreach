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
  // One or more templates. With >1 the queue rotates across them
  // (balanced-random per send) for body A/B testing.
  template_ids: z
    .array(z.string().uuid())
    .min(1, "Pilih minimal 1 template"),
  audience_type: z.enum(["all", "tag", "deliverable"]),
  audience_tag: z.string().optional(),
  schedule_start_time: z.string().regex(/^\d{2}:\d{2}$/),
  schedule_end_time: z.string().regex(/^\d{2}:\d{2}$/),
  daily_target: z.coerce.number().int().min(1).max(500),
  use_ai_opener: z.coerce.boolean().optional().default(true),
  cold_mode: z.coerce.boolean().optional().default(true),
  test_mode: z.coerce.boolean().optional().default(false),
  // Pool ordering: 'random' (default, Fisher-Yates) or 'warm_first'
  // (engagement_score DESC, then random tiebreak).
  pool_order: z.enum(["random", "warm_first"]).optional().default("random"),
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
    // Repeated form fields collapse under Object.fromEntries — read the full
    // list explicitly.
    template_ids: formData.getAll("template_ids").map(String),
    use_ai_opener: formData.get("use_ai_opener") === "on",
    cold_mode: formData.get("cold_mode") === "on",
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

  // Follow-up templates never go out as a first email — they belong in the
  // Follow-up Sequence. Drop them from the rotation the form submitted.
  const { data: firstTouch } = await supabase
    .from("templates")
    .select("id")
    .eq("workspace_id", workspace.id)
    .is("deleted_at", null)
    .or("category.is.null,category.neq.follow-up")
    .in("id", data.template_ids);
  const firstTouchIds = new Set((firstTouch ?? []).map((t) => t.id as string));
  data.template_ids = data.template_ids.filter((id) => firstTouchIds.has(id));
  if (data.template_ids.length === 0) {
    return {
      fieldErrors: {
        template_ids:
          "Pilih minimal 1 template email pertama (template follow-up dipasang di Follow-up Sequence).",
      },
    };
  }
  const audienceFilter =
    data.audience_type === "tag"
      ? { type: "tag", tag: data.audience_tag ?? "" }
      : data.audience_type === "deliverable"
        ? { type: "deliverable" }
        : { type: "all" };
  const deliverableOnly = data.audience_type === "deliverable";

  // Resolve audience to contact IDs.
  // archived_at filter excludes anything the bounce-detector or the user
  // has shelved — bounced, blocked, soft-bounce-threshold, manual archive.
  let contactQuery = supabase
    .from("contacts")
    .select("id, engagement_score")
    .is("deleted_at", null)
    .is("archived_at", null)
    .eq("status", "active");
  if (data.audience_type === "tag" && data.audience_tag) {
    contactQuery = contactQuery.contains("tags", [data.audience_tag]);
  }
  // Warm-first: order by engagement_score DESC at the DB layer so we don't
  // need to sort 14k rows in JS. Random mode just doesn't apply an ORDER BY.
  if (data.pool_order === "warm_first") {
    contactQuery = contactQuery.order("engagement_score", { ascending: false });
  }
  // "deliverable" is resolved in SQL by refill_queue after the queue exists —
  // proving deliverability needs campaign_recipients history, and a JS load
  // here would also hit PostgREST's 1000-row cap.
  const { data: contactsRaw } = deliverableOnly
    ? { data: [{ id: "" }] }
    : await contactQuery;
  if (!contactsRaw || contactsRaw.length === 0) {
    return {
      error:
        "Tidak ada kontak yang match audience ini. Tambah kontak atau ganti filter dulu.",
    };
  }
  let contacts: Array<{ id: string; engagement_score?: number }> =
    deliverableOnly
      ? []
      : [...(contactsRaw as Array<{ id: string; engagement_score?: number }>)];

  if (data.pool_order === "warm_first") {
    // Stable bucket-shuffle: keep engaged contacts at the top, but randomise
    // ordering inside each engagement bucket so multiple queues drawing
    // from the same pool don't queue identical sequences.
    const buckets = new Map<number, typeof contacts>();
    for (const c of contacts) {
      const bucket = c.engagement_score ?? 0;
      if (!buckets.has(bucket)) buckets.set(bucket, []);
      buckets.get(bucket)!.push(c);
    }
    contacts = [];
    for (const score of Array.from(buckets.keys()).sort((a, b) => b - a)) {
      const arr = buckets.get(score)!;
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      contacts.push(...arr);
    }
  } else {
    // Plain Fisher-Yates over the whole pool.
    for (let i = contacts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [contacts[i], contacts[j]] = [contacts[j], contacts[i]];
    }
  }

  // Create queue
  const { data: queue, error } = await supabase
    .from("send_queues")
    .insert({
      user_id: user.id,
      workspace_id: workspace.id,
      name: data.name,
      template_id: data.template_ids[0],
      template_ids: data.template_ids,
      audience_filter: audienceFilter,
      is_active: true,
      schedule_start_time: `${data.schedule_start_time}:00`,
      schedule_end_time: `${data.schedule_end_time}:00`,
      daily_target: data.daily_target,
      use_ai_opener: data.use_ai_opener,
      cold_mode: data.cold_mode,
      test_mode: data.test_mode,
      total_in_queue: contacts.length,
      total_pending: contacts.length,
    })
    .select("id")
    .single();

  if (error || !queue) return { error: error?.message ?? "Gagal create queue" };

  // Bulk insert queue_recipients. For warm_first we copy engagement_score
  // into priority so queue-runner's `ORDER BY priority DESC` naturally
  // picks engaged contacts first. For random, priority stays 0 across
  // the board and the id-based tiebreak inside queue-runner keeps order
  // shuffled.
  const BATCH = 500;
  for (let i = 0; i < contacts.length; i += BATCH) {
    const batch = contacts.slice(i, i + BATCH).map((c) => ({
      queue_id: queue.id,
      contact_id: c.id,
      user_id: user.id,
      workspace_id: workspace.id,
      status: "pending",
      priority:
        data.pool_order === "warm_first" ? (c.engagement_score ?? 0) : 0,
    }));
    await supabase.from("queue_recipients").insert(batch);
  }
  if (deliverableOnly) {
    const { data: added } = await supabase.rpc("refill_queue", {
      p_queue_id: queue.id,
      p_max_add: data.daily_target * 7,
    });
    if (!added) {
      return {
        error:
          "Queue dibuat, tapi belum ada kontak yang terbukti menerima email. Kirim dari queue lain dulu, lalu refill.",
      };
    }
  }

  revalidatePath(`/w/${slug}/queues`);
  return { success: true, queueId: queue.id };
}

type QueueMutResult = { ok: true } | { ok: false; error: string };

// Resolve the queue only if it belongs to a workspace the current user owns.
// Guards these bare-id mutations against acting across workspaces and makes
// them robust even if RLS is ever loosened.
async function ownedQueue(
  slug: string,
  queueId: string,
): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) return { ok: false, error: "Workspace not found" };
  const { data: queue } = await supabase
    .from("send_queues")
    .select("id")
    .eq("id", queueId)
    .eq("workspace_id", workspace.id)
    .maybeSingle();
  if (!queue) return { ok: false, error: "Queue not found" };
  return { ok: true, supabase };
}

export async function pauseQueue(
  slug: string,
  queueId: string,
): Promise<QueueMutResult> {
  const owned = await ownedQueue(slug, queueId);
  if (!owned.ok) return owned;
  const { error } = await owned.supabase
    .from("send_queues")
    .update({
      is_active: false,
      paused_at: new Date().toISOString(),
      paused_reason: "Manually paused",
    })
    .eq("id", queueId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/w/${slug}/queues/${queueId}`);
  revalidatePath(`/w/${slug}/queues`);
  return { ok: true };
}

export async function resumeQueue(
  slug: string,
  queueId: string,
): Promise<QueueMutResult> {
  const owned = await ownedQueue(slug, queueId);
  if (!owned.ok) return owned;
  const { error } = await owned.supabase
    .from("send_queues")
    .update({
      is_active: true,
      paused_at: null,
      paused_reason: null,
    })
    .eq("id", queueId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/w/${slug}/queues/${queueId}`);
  revalidatePath(`/w/${slug}/queues`);
  return { ok: true };
}

export async function deleteQueueAction(
  slug: string,
  queueId: string,
): Promise<QueueMutResult> {
  const owned = await ownedQueue(slug, queueId);
  if (!owned.ok) return owned;
  // Hard delete the queue (queue_recipients cascade)
  const { error } = await owned.supabase
    .from("send_queues")
    .delete()
    .eq("id", queueId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/w/${slug}/queues`);
  redirect(`/w/${slug}/queues`);
}

/**
 * Replace the template rotation pool for an existing queue. With >1 template
 * the queue rotates across them (balanced-random per send). template_id is
 * kept in sync with the first entry for back-compat.
 */
export async function updateQueueTemplates(
  slug: string,
  queueId: string,
  templateIds: string[],
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) return { error: "Workspace not found" };

  const ids = Array.from(new Set(templateIds.filter(Boolean)));
  if (ids.length === 0) return { error: "Pilih minimal 1 template" };

  // Only accept templates that belong to this workspace.
  // Follow-up templates are excluded: they only make sense as a reply in an
  // existing thread (Follow-up Sequence), never as the first email.
  const { data: owned } = await supabase
    .from("templates")
    .select("id")
    .eq("workspace_id", workspace.id)
    .is("deleted_at", null)
    .or("category.is.null,category.neq.follow-up")
    .in("id", ids);
  const ownedIds = new Set(
    (owned ?? []).map((t) => (t as { id: string }).id),
  );
  // Preserve the submitted order, dropping any that aren't valid.
  const valid = ids.filter((id) => ownedIds.has(id));
  if (valid.length === 0) return { error: "Template tidak valid" };

  const { error } = await supabase
    .from("send_queues")
    .update({ template_id: valid[0], template_ids: valid })
    .eq("id", queueId)
    .eq("workspace_id", workspace.id);
  if (error) return { error: error.message };

  revalidatePath(`/w/${slug}/queues/${queueId}`);
  revalidatePath(`/w/${slug}/templates`);
  return {};
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

/**
 * Manual "Reshuffle now" — regenerates shuffle_key on all pending
 * recipients so the next batch picks fresh random positions across the
 * pool. The runner also reshuffles automatically once per WIB day; this
 * is for when the user wants a rotation between days.
 */
export async function reshuffleQueueAction(
  slug: string,
  queueId: string,
): Promise<{ ok: true; reshuffled: number } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Ownership check before mutating
  const { data: queue } = await supabase
    .from("send_queues")
    .select("id, user_id")
    .eq("id", queueId)
    .maybeSingle();
  if (!queue || queue.user_id !== user.id) {
    return { ok: false, error: "Unauthorized or queue not found" };
  }

  const { data, error } = await supabase.rpc("reshuffle_queue", {
    p_queue_id: queueId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/w/${slug}/queues/${queueId}`);
  revalidatePath(`/w/${slug}/queues`);
  return { ok: true, reshuffled: (data as number) ?? 0 };
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
