// Client-safe types and constants for send queues.

export type SendQueue = {
  id: string;
  user_id: string;
  workspace_id: string;
  name: string;
  template_id: string | null;
  template_ids: string[] | null;
  audience_filter: AudienceFilter;
  is_active: boolean;
  schedule_days: number[];
  schedule_start_time: string;
  schedule_end_time: string;
  daily_target: number;
  followup_enabled: boolean;
  followup_template_id: string | null;
  followup_after_days: number;
  followup_steps: FollowupStep[];
  use_ai_opener: boolean;
  test_mode: boolean;
  is_one_shot: boolean;
  scheduled_start_at: string | null;
  total_in_queue: number;
  total_sent: number;
  total_pending: number;
  total_replied: number;
  total_bounced: number;
  last_run_at: string | null;
  last_shuffled_at: string | null;
  last_refilled_at: string | null;
  next_run_at: string | null;
  paused_at: string | null;
  paused_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type AudienceFilter =
  | { type: "all" }
  | { type: "tag"; tag: string }
  | { type: "manual"; contact_ids: string[] };

export type FollowupStep = {
  template_id: string;
  after_days: number;
};

export const MAX_FOLLOWUP_STEPS = 3;
export const DEFAULT_FOLLOWUP_DAYS = [4, 7, 7] as const;

export const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export function formatDays(days: number[]): string {
  if (days.length === 7) return "Setiap hari";
  if (
    days.length === 5 &&
    [1, 2, 3, 4, 5].every((d) => days.includes(d))
  ) {
    return "Sen-Jum";
  }
  // schedule_days is ISO (1=Mon .. 7=Sun); DAY_NAMES is 0-indexed Sunday-first,
  // so map via `d % 7` (Sunday 7 → 0 = "Min", others unchanged). Copy before
  // sorting so we don't mutate the caller's array.
  return [...days]
    .sort((a, b) => a - b)
    .map((d) => DAY_NAMES[d % 7])
    .join(", ");
}

export function formatTime(t: string): string {
  return t.slice(0, 5); // HH:MM:SS → HH:MM
}

export function progressPercent(q: Pick<SendQueue, "total_sent" | "total_in_queue">): number {
  if (q.total_in_queue === 0) return 0;
  return Math.round((q.total_sent / q.total_in_queue) * 100);
}
