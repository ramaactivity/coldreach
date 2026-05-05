"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  getDefaultPipelineForBusinessType,
  getDefaultScheduleForBusinessType,
} from "@/lib/workspace-constants";
import { slugify } from "@/lib/slug";

const CreateWorkspaceSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter").max(50, "Nama maksimal 50 karakter"),
  business_type: z.enum([
    "catering",
    "photography",
    "design",
    "consulting",
    "other",
  ]),
  color_theme: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid color"),
});

export type CreateWorkspaceState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function createWorkspace(
  _prev: CreateWorkspaceState,
  formData: FormData,
): Promise<CreateWorkspaceState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = CreateWorkspaceSchema.safeParse({
    name: formData.get("name"),
    business_type: formData.get("business_type"),
    color_theme: formData.get("color_theme"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { fieldErrors };
  }

  const { name, business_type, color_theme } = parsed.data;
  const slug = slugify(name);

  if (!slug) {
    return { fieldErrors: { name: "Nama harus mengandung huruf/angka" } };
  }

  // Check slug uniqueness for this user
  const { data: existing } = await supabase
    .from("workspaces")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existing) {
    return {
      fieldErrors: { name: "Nama ini sudah dipakai. Pilih nama lain." },
    };
  }

  const schedule = getDefaultScheduleForBusinessType(business_type);
  const pipeline = getDefaultPipelineForBusinessType(business_type);

  const { data: workspace, error } = await supabase
    .from("workspaces")
    .insert({
      user_id: user.id,
      name,
      slug,
      business_type,
      color_theme,
      pipeline_stages: pipeline,
      schedule_start_time: schedule.schedule_start_time,
      schedule_end_time: schedule.schedule_end_time,
      daily_target: schedule.daily_target,
    })
    .select("id, slug")
    .single();

  if (error || !workspace) {
    return { error: error?.message ?? "Gagal membuat workspace" };
  }

  // Set as last active workspace
  await supabase
    .from("users")
    .update({ last_active_workspace_id: workspace.id })
    .eq("id", user.id);

  redirect(`/w/${workspace.slug}/dashboard`);
}
