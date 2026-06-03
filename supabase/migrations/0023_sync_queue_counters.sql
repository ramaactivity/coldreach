-- =============================================================================
-- ColdReach — Drift-proof queue counters
-- File: 0023_sync_queue_counters.sql
-- Created: 2026-06-03
--
-- Problem
--   send_queues.total_pending is a CACHED counter. queue-runner.ts maintains
--   it by decrementing once per *sent* email, but skipped recipients (e.g.
--   cross-workspace dedup) and externally-added recipients never adjust it.
--   So it drifts. refill_queue() resyncs it, but only for 'all'/'tag'
--   audiences and only when the queue actually runs.
--
--   The fatal interaction: api/cron/queue-runner selected queues with
--   `total_pending > 0`. Once the cached counter drifted to 0 — while real
--   pending rows still existed — the queue was filtered out of every cron
--   tick, so runQueue() (and its self-healing refill/resync) never ran. A
--   catch-22 that silently flatlined a Gmail account.
--   Real incident: tetraphotobooth@gmail.com stalled 2026-05-29 with 288 real
--   pending rows but cached total_pending = 0.
--
-- Fix (defense in depth — paired with code changes)
--   1. queue-runner route no longer gates on the cached counter (code).
--   2. This RPC recomputes ALL five counters from the real queue_recipients
--      rows and is called at the end of every runQueue(), so the cache
--      converges to truth on every run regardless of skips. Works for ALL
--      audience types (unlike refill_queue, which is 'all'/'tag' only).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_queue_counters(p_queue_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.send_queues sq
    SET total_in_queue = c.total,
        total_pending  = c.pend,
        total_sent     = c.sent,
        total_replied  = c.replied,
        total_bounced  = c.bounced
    FROM (
      SELECT
        COUNT(*)                                  AS total,
        COUNT(*) FILTER (WHERE status = 'pending') AS pend,
        COUNT(*) FILTER (WHERE status = 'sent')    AS sent,
        COUNT(*) FILTER (WHERE status = 'replied') AS replied,
        COUNT(*) FILTER (WHERE status = 'bounced') AS bounced
      FROM public.queue_recipients
      WHERE queue_id = p_queue_id
    ) c
    WHERE sq.id = p_queue_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_queue_counters(UUID)
  TO service_role, authenticated;
