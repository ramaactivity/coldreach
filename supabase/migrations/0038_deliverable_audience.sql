-- =============================================================================
-- ColdReach — "Proven deliverable" queue audience
-- File: 0038_deliverable_audience.sql
--
-- New audience_filter type for send_queues:
--   { "type": "deliverable", "prefer_replied_workspace_ids": [uuid, ...] }
-- Only contacts whose address has already been proven to accept mail:
--   * replied to any workspace, or
--   * was sent to at least 3 days ago and never bounced (DSNs arrive well
--     within that window).
-- Contacts who answered "not interested" / asked to unsubscribe are left out.
-- Priority (queue-runner picks highest first):
--   1000  replied in one of prefer_replied_workspace_ids (e.g. Tiska)
--    500  replied in any other workspace
--    0-100 delivered, ranked by contact_position_priority as before
-- Built for the new tetraphoto.com domain, whose reputation can't take the
-- 8–20% bounce rate of the unverified pool.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.refill_queue(p_queue_id uuid, p_max_add integer DEFAULT 500)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  q RECORD;
  audience JSONB;
  preferred uuid[];
  inserted INTEGER := 0;
  real_total INTEGER;
  real_pend INTEGER;
  real_sent INTEGER;
BEGIN
  SELECT id, user_id, workspace_id, audience_filter INTO q
  FROM public.send_queues WHERE id = p_queue_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  audience := q.audience_filter;
  IF audience->>'type' NOT IN ('all','tag','deliverable') THEN RETURN 0; END IF;
  preferred := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(audience->'prefer_replied_workspace_ids')::uuid),
    '{}'::uuid[]);

  WITH eligible AS (
    SELECT c.id,
           CASE
             WHEN audience->>'type' <> 'deliverable' THEN public.contact_position_priority(c."position")
             WHEN EXISTS (SELECT 1 FROM public.campaign_recipients cr
                          WHERE cr.contact_id = c.id AND cr.status = 'replied'
                            AND cr.workspace_id = ANY (preferred)) THEN 1000
             WHEN EXISTS (SELECT 1 FROM public.campaign_recipients cr
                          WHERE cr.contact_id = c.id AND cr.status = 'replied') THEN 500
             ELSE public.contact_position_priority(c."position")
           END AS prio
    FROM public.contacts c
    WHERE c.user_id = q.user_id
      AND c.deleted_at IS NULL
      AND c.archived_at IS NULL
      AND c.status = 'active'
      AND (audience->>'type' IN ('all','deliverable')
           OR (audience->>'type' = 'tag' AND c.tags @> ARRAY[audience->>'tag']::text[]))
      AND (audience->>'type' <> 'deliverable' OR (
            EXISTS (SELECT 1 FROM public.campaign_recipients cr
                    WHERE cr.contact_id = c.id
                      AND (cr.status = 'replied'
                           OR (cr.status IN ('sent','opened') AND cr.sent_at <= now() - interval '3 days')))
            AND NOT EXISTS (SELECT 1 FROM public.campaign_recipients cr
                            WHERE cr.contact_id = c.id
                              AND (cr.status = 'bounced'
                                   OR cr.reply_classification IN ('not_interested','unsubscribe_request')))))
      AND NOT EXISTS (
        SELECT 1 FROM public.queue_recipients qr
        WHERE qr.queue_id = p_queue_id AND qr.contact_id = c.id)
    ORDER BY 2 DESC, random()
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
