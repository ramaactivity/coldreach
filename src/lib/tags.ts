import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/session-helpers";

export type TagUsage = {
  tag: string;
  contact_count: number;
};

export async function getTagUsage(): Promise<TagUsage[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_tag_usage_for_user", {
    uid: user.id,
  });
  if (error) {
    console.error("getTagUsage error:", error);
    return [];
  }
  return ((data ?? []) as Array<{ tag: string; contact_count: number }>).map(
    (r) => ({
      tag: r.tag,
      contact_count: r.contact_count ?? 0,
    }),
  );
}
