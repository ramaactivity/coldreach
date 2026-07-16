-- =============================================================================
-- ColdReach — Position-based send priority (audit 2026-07-16, opsi 5)
-- File: 0031_position_priority.sql
--
-- Cold sends were ordered by (priority DESC, shuffle_key) but priority was
-- always 0, so decision-makers (GA / procurement / sekretaris — the people
-- who actually pick catering & event vendors) waited in line behind random
-- staff. Score positions into tiers and use the score both at refill time
-- and as a backfill for already-pending queue recipients:
--   100 = vendor decision-makers (general affairs, procurement, purchasing,
--         office manager, sekretaris/corsec, admin)
--    50 = influencers (HR/HRD/personalia, event, marcom/marketing/comms,
--         humas/PR)
--     0 = everyone else / no position data
-- =============================================================================

CREATE OR REPLACE FUNCTION public.contact_position_priority(p_position text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_position IS NULL THEN 0
    WHEN p_position ~* '(general\s*affair|procurement|purchas|office\s*manag|sekretar|secretar|corsec|\yga\y|\yadmin)' THEN 100
    WHEN p_position ~* '(human\s*resou|\yhrd?\y|personalia|\yevent|marcom|marketing|communicat|\yhumas\y|public\s*relation)' THEN 50
    ELSE 0
  END
$$;

-- refill_queue now stamps the position score as priority on insert (was
-- hardcoded 0). Everything else is unchanged from the previous definition.
CREATE OR REPLACE FUNCTION public.refill_queue(p_queue_id uuid, p_max_add integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  q RECORD;
  audience JSONB;
  inserted INTEGER := 0;
  real_total INTEGER;
  real_pend INTEGER;
  real_sent INTEGER;
BEGIN
  SELECT id, user_id, workspace_id, audience_filter INTO q
  FROM public.send_queues WHERE id = p_queue_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  audience := q.audience_filter;
  IF audience->>'type' NOT IN ('all','tag') THEN RETURN 0; END IF;

  WITH eligible AS (
    SELECT c.id, public.contact_position_priority(c."position") AS prio
    FROM public.contacts c
    WHERE c.user_id = q.user_id
      AND c.deleted_at IS NULL
      AND c.archived_at IS NULL
      AND c.status = 'active'
      AND (audience->>'type' = 'all'
           OR (audience->>'type' = 'tag' AND c.tags @> ARRAY[audience->>'tag']::text[]))
      AND NOT EXISTS (
        SELECT 1 FROM public.queue_recipients qr
        WHERE qr.queue_id = p_queue_id AND qr.contact_id = c.id)
    ORDER BY random()
    LIMIT p_max_add
  ), ins AS (
    INSERT INTO public.queue_recipients
      (queue_id, contact_id, user_id, workspace_id, status, priority, shuffle_key)
    SELECT p_queue_id, e.id, q.user_id, q.workspace_id, 'pending', e.prio,
           (floor(random() * 1000000000))::int
    FROM eligible e
    ON CONFLICT (queue_id, contact_id) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO inserted FROM ins;

  SELECT COUNT(*) FILTER (WHERE TRUE),
         COUNT(*) FILTER (WHERE status = 'pending'),
         COUNT(*) FILTER (WHERE status = 'sent')
    INTO real_total, real_pend, real_sent
  FROM public.queue_recipients WHERE queue_id = p_queue_id;

  UPDATE public.send_queues
     SET total_in_queue = real_total,
         total_pending = real_pend,
         total_sent = real_sent,
         last_refilled_at = CASE WHEN inserted > 0 THEN now() ELSE last_refilled_at END
   WHERE id = p_queue_id;

  RETURN inserted;
END;
$function$;

-- Backfill: score every still-pending queue recipient from its contact's
-- position so the new ordering takes effect immediately, not only for
-- future refills.
UPDATE public.queue_recipients qr
SET priority = public.contact_position_priority(c."position")
FROM public.contacts c
WHERE c.id = qr.contact_id
  AND qr.status = 'pending'
  AND qr.priority IS DISTINCT FROM public.contact_position_priority(c."position");
