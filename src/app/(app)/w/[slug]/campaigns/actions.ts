"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug } from "@/lib/workspaces";

const CreateCampaignSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter").max(100),
  template_id: z.string().uuid("Pilih template"),
  audience_type: z.enum(["all", "tag"]),
  audience_tag: z.string().optional(),
  send_when: z.enum(["now", "scheduled"]),
  scheduled_start_at: z.string().optional(), // ISO datetime-local
  daily_target: z.coerce.number().int().min(1).max(500),
  use_ai_opener: z.coerce.boolean().optional().default(true),
  test_mode: z.coerce.boolean().optional().default(false),
});

export type CreateCampaignState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
  campaignId?: string;
};

export async function createCampaign(
  slug: string,
  _prev: CreateCampaignState,
  formData: FormData,
): Promise<CreateCampaignState> {
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
  const parsed = CreateCampaignSchema.safeParse(raw);

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

  // Validate scheduled time if scheduled
  let scheduledStartAt: string | null = null;
  if (data.send_when === "scheduled") {
    if (!data.scheduled_start_at) {
      return { fieldErrors: { scheduled_start_at: "Pilih tanggal & jam" } };
    }
    const scheduledDate = new Date(data.scheduled_start_at);
    if (Number.isNaN(scheduledDate.getTime())) {
      return { fieldErrors: { scheduled_start_at: "Format tanggal invalid" } };
    }
    if (scheduledDate.getTime() < Date.now() - 60_000) {
      return {
        fieldErrors: { scheduled_start_at: "Tanggal harus di masa depan" },
      };
    }
    scheduledStartAt = scheduledDate.toISOString();
  }

  // Resolve audience. Exclude archived contacts — archiveContact sets
  // archived_at (bounce threshold / manual) but leaves status='active', so a
  // status-only filter would re-enlist a contact the user deliberately shelved.
  let contactQuery = supabase
    .from("contacts")
    .select("id")
    .is("deleted_at", null)
    .is("archived_at", null)
    .eq("status", "active");
  if (data.audience_type === "tag" && data.audience_tag) {
    contactQuery = contactQuery.contains("tags", [data.audience_tag]);
  }
  const { data: contacts } = await contactQuery;
  if (!contacts || contacts.length === 0) {
    return {
      error: "Tidak ada kontak yang match audience ini.",
    };
  }

  // Insert as send_queue with is_one_shot=true
  const { data: campaign, error } = await supabase
    .from("send_queues")
    .insert({
      user_id: user.id,
      workspace_id: workspace.id,
      name: data.name,
      template_id: data.template_id,
      audience_filter: audienceFilter,
      is_active: true,
      is_one_shot: true,
      scheduled_start_at: scheduledStartAt,
      schedule_days: [1, 2, 3, 4, 5, 6, 7], // permissive (cron ignores anyway)
      schedule_start_time: "00:00:00",
      schedule_end_time: "23:59:59",
      daily_target: data.daily_target,
      use_ai_opener: data.use_ai_opener,
      test_mode: data.test_mode,
      total_in_queue: contacts.length,
      total_pending: contacts.length,
    })
    .select("id")
    .single();

  if (error || !campaign) {
    return { error: error?.message ?? "Gagal create campaign" };
  }

  // Bulk insert queue_recipients
  const BATCH = 500;
  for (let i = 0; i < contacts.length; i += BATCH) {
    const batch = contacts.slice(i, i + BATCH).map((c) => ({
      queue_id: campaign.id,
      contact_id: c.id,
      user_id: user.id,
      workspace_id: workspace.id,
      status: "pending",
      priority: 0,
    }));
    await supabase.from("queue_recipients").insert(batch);
  }

  revalidatePath(`/w/${slug}/campaigns`);
  return { success: true, campaignId: campaign.id };
}
