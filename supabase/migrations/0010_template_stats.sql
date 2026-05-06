-- =============================================================================
-- ColdReach — Template Performance Analytics
-- File: 0010_template_stats.sql
-- Created: 2026-05-06
--
-- Aggregates per-template performance from the queue → recipient pipeline:
--   send_queues (template_id) ← queue_recipients ← campaign_recipients
--
-- Returns counts for sent / opened / replied per template_id, plus
-- last_used_at. Reply rate / open rate computed in app (avoid /0 in SQL).
--
-- Defined as SQL function (SECURITY INVOKER by default → respects RLS).
-- Safe to call from any authenticated context.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_template_stats_for_workspace(ws_id UUID)
RETURNS TABLE (
  template_id UUID,
  sent_count INT,
  opened_count INT,
  replied_count INT,
  last_used_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    q.template_id,
    COUNT(cr.id) FILTER (WHERE cr.sent_at IS NOT NULL)::int AS sent_count,
    COUNT(cr.id) FILTER (WHERE cr.opened_at IS NOT NULL)::int AS opened_count,
    COUNT(cr.id) FILTER (WHERE cr.replied_at IS NOT NULL)::int AS replied_count,
    MAX(cr.sent_at) AS last_used_at
  FROM public.send_queues q
  JOIN public.queue_recipients qr ON qr.queue_id = q.id
  LEFT JOIN public.campaign_recipients cr ON cr.id = qr.campaign_recipient_id
  WHERE q.workspace_id = ws_id
    AND q.template_id IS NOT NULL
  GROUP BY q.template_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_template_stats_for_workspace(UUID)
  TO anon, authenticated;
