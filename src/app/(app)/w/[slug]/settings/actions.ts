"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function disconnectGmail(slug: string, accountId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Soft disconnect: unbind from workspace, mark inactive.
  // We KEEP the row + tokens so re-connect can update without losing history.
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
    updates.daily_quota = 5; // start small
  } else {
    updates.warmup_started_at = null;
    updates.daily_quota = 30; // back to default
  }

  await supabase
    .from("email_accounts")
    .update(updates)
    .eq("id", accountId)
    .eq("user_id", user.id);

  revalidatePath(`/w/${slug}/settings`);
}
