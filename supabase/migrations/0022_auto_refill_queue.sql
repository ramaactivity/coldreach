-- =============================================================================
-- ColdReach — Evergreen queues via auto-refill
-- File: 0022_auto_refill_queue.sql
-- Created: 2026-05-25
--
-- Problem
--   Queues stop sending the moment queue_recipients runs dry (pending = 0)
--   even when the audience pool still has untouched contacts. Real example:
--   "Cold Outreach Catering Corporate" had 14k contacts available, but only
--   1000 were ever inserted at creation; once 647 sent + 276 skipped via
--   cross-workspace dedup, the queue silently flatlined.
--
-- Fix
--   refill_queue() RPC pulls audience-matching contacts NOT already in this
--   queue and inserts them as fresh pending rows (with random shuffle_key
--   so they fold into the same daily-shuffle pool). queue-runner.ts calls
--   it whenever actual pending count drops below daily_target × 2, topping
--   up to daily_target × 7 (one week of buffer). Bounded so we don't
--   explode queue size in one tick.
--
--   The RPC also resyncs total_in_queue / total_pending from actual row
--   counts — those counters drift over time (skipped rows decrement
--   total_pending in some paths but not others), and refill is a natural
--   place to bring them back to truth.
--
-- audience_filter = 'manual' is excluded — it's a fixed list by design.
-- =============================================================================

ALTER TABLE public.send_queues
  ADD COLUMN IF NOT EXISTS last_refilled_at TIMESTAMPTZ;

COMMENT ON COLUMN public.send_queues.last_refilled_at IS
  'When refill_queue() last added contacts to this queue. NULL = never (legacy or fresh).';

CREATE OR REPLACE FUNCTION public.refill_queue(
  p_queue_id UUID,
  p_max_add INTEGER DEFAULT 500
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q          RECORD;
  audience   JSONB;
  inserted   INTEGER := 0;
  real_total INTEGER;
  real_pend  INTEGER;
  real_sent  INTEGER;
BEGIN
  SELECT id, user_id, workspace_id, audience_filter
    INTO q
    FROM public.send_queues
    WHERE id = p_queue_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  audience := q.audience_filter;

  -- Manual audiences are a frozen contact list — never auto-refill.
  -- Unknown audience type: skip rather than fail.
  IF audience->>'type' NOT IN ('all', 'tag') THEN
    RETURN 0;
  END IF;

  -- Insert audience-matching contacts that aren't already in this queue.
  -- ON CONFLICT DO NOTHING guards the (queue_id, contact_id) UNIQUE so
  -- concurrent runners can't double-add.
  WITH eligible AS (
    SELECT c.id
      FROM public.contacts c
      WHERE c.user_id = q.user_id
        AND c.deleted_at IS NULL
        AND c.archived_at IS NULL
        AND c.status = 'active'
        AND (
          audience->>'type' = 'all'
          OR (
            audience->>'type' = 'tag'
            AND c.tags @> ARRAY[audience->>'tag']::text[]
          )
        )
        AND NOT EXISTS (
          SELECT 1
            FROM public.queue_recipients qr
            WHERE qr.queue_id = p_queue_id
              AND qr.contact_id = c.id
        )
      ORDER BY random()
      LIMIT p_max_add
  ),
  ins AS (
    INSERT INTO public.queue_recipients
      (queue_id, contact_id, user_id, workspace_id, status, priority, shuffle_key)
    SELECT
      p_queue_id,
      e.id,
      q.user_id,
      q.workspace_id,
      'pending',
      0,
      (floor(random() * 1000000000))::int
    FROM eligible e
    ON CONFLICT (queue_id, contact_id) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO inserted FROM ins;

  -- Resync counters from reality. They drift over time because various
  -- paths update them inconsistently (some decrement total_pending on
  -- skip, some don't), and refill is a natural sync point.
  SELECT
    COUNT(*) FILTER (WHERE TRUE),
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'sent')
    INTO real_total, real_pend, real_sent
    FROM public.queue_recipients
    WHERE queue_id = p_queue_id;

  UPDATE public.send_queues
    SET total_in_queue = real_total,
        total_pending  = real_pend,
        total_sent     = real_sent,
        last_refilled_at = CASE WHEN inserted > 0 THEN now() ELSE last_refilled_at END
    WHERE id = p_queue_id;

  RETURN inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refill_queue(UUID, INTEGER)
  TO service_role, authenticated;
