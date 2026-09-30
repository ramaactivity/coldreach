-- =============================================================================
-- ColdReach — Per-template scoreboard (A/B report)
-- File: 0040_template_scoreboard.sql
--
-- get_queue_template_breakdown counted `sent` as queue_recipients.status =
-- 'sent', but replied/bounced rows move to status 'replied'/'bounced' — so
-- every reply and bounce fell out of the denominator. Count by sent_at, and
-- add what decides a winner: hot replies, bounces, and closed deals.
-- Legacy rows with no queue_recipients.template_id are left out instead of
-- being credited to whatever template is the queue's primary today.
-- =============================================================================

DROP FUNCTION IF EXISTS public.get_queue_template_breakdown(uuid);

CREATE FUNCTION public.get_queue_template_breakdown(p_queue_id uuid)
 RETURNS TABLE(template_id uuid, sent integer, replied integer, hot integer,
               bounced integer, deals integer, deal_value numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    qr.template_id,
    COUNT(qr.id) FILTER (WHERE qr.sent_at IS NOT NULL)::int AS sent,
    COUNT(cr.id) FILTER (WHERE cr.replied_at IS NOT NULL)::int AS replied,
    COUNT(cr.id) FILTER (WHERE cr.reply_classification IN ('interested','question'))::int AS hot,
    COUNT(cr.id) FILTER (WHERE cr.status = 'bounced')::int AS bounced,
    COUNT(cwd.contact_id) FILTER (WHERE cwd.deal_closed_at IS NOT NULL AND cr.replied_at IS NOT NULL)::int AS deals,
    COALESCE(SUM(cwd.deal_value) FILTER (WHERE cwd.deal_closed_at IS NOT NULL AND cr.replied_at IS NOT NULL), 0) AS deal_value
  FROM public.send_queues q
  JOIN public.queue_recipients qr ON qr.queue_id = q.id
  LEFT JOIN public.campaign_recipients cr ON cr.id = qr.campaign_recipient_id
  LEFT JOIN public.contact_workspace_data cwd
    ON cwd.contact_id = qr.contact_id AND cwd.workspace_id = q.workspace_id
  WHERE q.id = p_queue_id
    AND qr.template_id IS NOT NULL
  GROUP BY qr.template_id;
$function$;

GRANT EXECUTE ON FUNCTION public.get_queue_template_breakdown(uuid) TO authenticated, service_role;
