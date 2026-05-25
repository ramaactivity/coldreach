-- =============================================================================
-- ColdReach — Per-day random batch ordering for send queues
-- File: 0020_queue_random_picks.sql
-- Created: 2026-05-25
--
-- Problem
--   queue_recipients were ordered by `id ASC` at send time. With ~14k rows
--   shuffled once at queue creation, the per-day pick stayed identical
--   forever — contacts at the "bottom" of the shuffle waited 50+ days to
--   ever get a touch. Across 3 workspaces (3 Gmail accounts, shared
--   contact pool) this also meant each account walked through its
--   independent shuffle in lockstep.
--
-- Fix
--   1. shuffle_key on queue_recipients — random int per row, indexed.
--   2. last_shuffled_at on send_queues — runner reshuffles pending rows
--      once per day so every day picks a fresh random subset across the
--      whole pool (top / middle / bottom).
--   3. reshuffle_queue() helper — also exposed via a "Reshuffle now"
--      action in the UI for manual rotation.
--
-- Cross-workspace dedup (existing) handles "no two accounts hit the same
-- email on the same day"; this migration tackles the ordering side.
-- =============================================================================

-- 1. Random shuffle key for ordering pending recipients.
ALTER TABLE public.queue_recipients
  ADD COLUMN IF NOT EXISTS shuffle_key INTEGER NOT NULL
    DEFAULT (floor(random() * 1000000000))::int;

-- 2. Backfill existing rows so old queues benefit immediately.
--    (DEFAULT only applies to NEW rows, so existing rows would all carry 0.)
UPDATE public.queue_recipients
  SET shuffle_key = (floor(random() * 1000000000))::int
  WHERE shuffle_key = 0;

-- 3. Track the last reshuffle so the runner only rotates once per day.
ALTER TABLE public.send_queues
  ADD COLUMN IF NOT EXISTS last_shuffled_at TIMESTAMPTZ;

-- 4. Index tuned for the runner's hot path:
--      ORDER BY priority DESC, shuffle_key ASC LIMIT N
--      WHERE queue_id = ? AND status = 'pending'
CREATE INDEX IF NOT EXISTS idx_queue_recipients_pick_order
  ON public.queue_recipients (queue_id, priority DESC, shuffle_key)
  WHERE status = 'pending';

-- 5. RPC helper. Called from the runner (daily) and from the manual
--    "Reshuffle now" button. Returns how many rows were reshuffled.
CREATE OR REPLACE FUNCTION public.reshuffle_queue(p_queue_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INTEGER;
BEGIN
  UPDATE public.queue_recipients
    SET shuffle_key = (floor(random() * 1000000000))::int
    WHERE queue_id = p_queue_id AND status = 'pending';
  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE public.send_queues
    SET last_shuffled_at = now()
    WHERE id = p_queue_id;

  RETURN n;
END;
$$;

-- Allow the runner (admin) and authenticated users (manual reshuffle)
-- to call this. Ownership is enforced by the calling action.
GRANT EXECUTE ON FUNCTION public.reshuffle_queue(UUID) TO service_role, authenticated;

COMMENT ON COLUMN public.queue_recipients.shuffle_key IS
  'Random 0..1B integer used as the tie-breaker when picking the next batch. Regenerated daily by the runner via reshuffle_queue().';
COMMENT ON COLUMN public.send_queues.last_shuffled_at IS
  'When reshuffle_queue() last ran for this queue. NULL = never (legacy). Runner reshuffles if NULL or older than today (WIB).';
