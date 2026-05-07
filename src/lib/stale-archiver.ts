import type { SupabaseClient } from "@supabase/supabase-js";

// Definition of "stale" — contact has been pinged enough times to give a
// signal, never engaged, and the most recent send is old enough that they
// were given a real chance to engage.
//
// Tuned conservatively: 5 sends across the same user's workspaces with no
// open OR reply, and the LAST send was at least 30 days ago. So a contact
// you started emailing yesterday won't be archived just because they
// haven't opened today.
const STALE_MIN_SENDS = 5;
const STALE_LAST_SEND_DAYS = 30;
const ARCHIVE_BATCH_LIMIT = 500;

export type StaleArchiveResult = {
  scanned: number;
  archived: number;
  errors: string[];
};

/**
 * Archive contacts that fit the stale definition. Idempotent — already-
 * archived contacts are filtered out via `archived_at IS NULL`.
 *
 * Runs as a cron daily; safe to invoke manually.
 */
export async function archiveStaleContacts(
  admin: SupabaseClient,
): Promise<StaleArchiveResult> {
  const result: StaleArchiveResult = { scanned: 0, archived: 0, errors: [] };

  const cutoffIso = new Date(
    Date.now() - STALE_LAST_SEND_DAYS * 24 * 3600 * 1000,
  ).toISOString();

  // Pull a bounded batch of candidates. We can run again next day if the
  // backlog is bigger than the limit.
  const { data: candidates, error } = await admin
    .from("contacts")
    .select("id, user_id, email")
    .is("deleted_at", null)
    .is("archived_at", null)
    .is("last_engaged_at", null)
    .gte("total_emails_sent_all_workspaces", STALE_MIN_SENDS)
    .lt("last_contacted_at_any", cutoffIso)
    .eq("status", "active")
    .limit(ARCHIVE_BATCH_LIMIT);

  if (error) {
    result.errors.push(error.message);
    return result;
  }
  if (!candidates || candidates.length === 0) return result;

  result.scanned = candidates.length;
  const ids = candidates.map((c) => (c as { id: string }).id);
  const nowIso = new Date().toISOString();

  const { data: archived } = await admin
    .from("contacts")
    .update({
      archived_at: nowIso,
      archive_reason: "stale_unengaged",
    })
    .in("id", ids)
    .select("id, user_id, email");

  result.archived = archived?.length ?? 0;

  // Cleanup any pending queue_recipients pointing at these contacts.
  if (result.archived > 0) {
    await admin
      .from("queue_recipients")
      .update({ status: "skipped" })
      .in("contact_id", ids)
      .eq("status", "pending");

    // One activity_log row per archived contact so the audit trail tells
    // the user *why* the contact was shelved.
    const rows = (archived ?? []).map((c) => {
      const r = c as { id: string; user_id: string; email: string };
      return {
        user_id: r.user_id,
        activity_type: "contact_archived",
        entity_type: "contact",
        entity_id: r.id,
        metadata: {
          reason: "stale_unengaged",
          email: r.email,
          min_sends: STALE_MIN_SENDS,
          inactive_days: STALE_LAST_SEND_DAYS,
        },
      };
    });
    if (rows.length > 0) {
      await admin.from("activity_log").insert(rows);
    }
  }

  return result;
}
