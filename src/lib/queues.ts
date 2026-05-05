import { createClient } from "@/lib/supabase/server";
import type { SendQueue } from "@/lib/queue-helpers";

export type { SendQueue, AudienceFilter } from "@/lib/queue-helpers";

export async function listQueues(workspaceId: string): Promise<SendQueue[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("send_queues")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listQueues error:", error);
    return [];
  }
  return (data ?? []) as SendQueue[];
}

export async function getQueueById(id: string): Promise<SendQueue | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("send_queues")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("getQueueById error:", error);
    return null;
  }
  return (data as SendQueue) ?? null;
}

export type QueueStats = {
  pending: number;
  sent: number;
  replied: number;
  bounced: number;
  skipped: number;
};

export async function getQueueStats(queueId: string): Promise<QueueStats> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("queue_recipients")
    .select("status")
    .eq("queue_id", queueId);

  const stats: QueueStats = {
    pending: 0,
    sent: 0,
    replied: 0,
    bounced: 0,
    skipped: 0,
  };
  for (const row of data ?? []) {
    const s = (row as { status: string }).status as keyof QueueStats;
    if (s in stats) stats[s]++;
  }
  return stats;
}
