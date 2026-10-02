-- =============================================================================
-- ColdReach — Send health ("Kesehatan kirim" page)
-- File: 0044_send_health.sql
--
-- One aggregate for /health over the caller's last p_days of sends
-- (first touches + follow-ups, by WIB send day):
--   daily         per workspace per day: sent, bounced, replied
--   bounce_types  per workspace: hard / block / soft / spam counts
--   domains       recipient domains with ≥2 bounces: sent, bounced, blocked,
--                 and how many still-active contacts sit on that domain
-- SECURITY INVOKER + auth.uid(): RLS applies, each user sees only their rows.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.send_health(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH base AS (
    SELECT cr.workspace_id,
           (cr.sent_at AT TIME ZONE 'Asia/Jakarta')::date AS day,
           cr.status,
           cr.bounce_type,
           split_part(lower(cr.contact_email), '@', 2) AS domain
    FROM public.campaign_recipients cr
    WHERE cr.user_id = auth.uid()
      AND cr.sent_at >= now() - make_interval(days => p_days)
      AND cr.status IN ('sent', 'opened', 'replied', 'bounced')
  ), dom AS (
    SELECT domain,
           count(*)::int AS sent,
           (count(*) FILTER (WHERE status = 'bounced'))::int AS bounced,
           (count(*) FILTER (WHERE status = 'bounced' AND bounce_type = 'block'))::int AS blocked
    FROM base
    GROUP BY domain
    HAVING count(*) FILTER (WHERE status = 'bounced') >= 2
    ORDER BY 3 DESC, 2 DESC
    LIMIT 30
  ), active AS (
    -- One pass over contacts for all listed domains.
    SELECT split_part(lower(c.email), '@', 2) AS domain, count(*)::int AS n
    FROM public.contacts c
    WHERE c.user_id = auth.uid()
      AND c.deleted_at IS NULL AND c.archived_at IS NULL AND c.status = 'active'
      AND split_part(lower(c.email), '@', 2) IN (SELECT domain FROM dom)
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'daily', (
      SELECT coalesce(jsonb_agg(d ORDER BY d.workspace_id, d.day), '[]'::jsonb)
      FROM (
        SELECT workspace_id, day,
               count(*)::int AS sent,
               (count(*) FILTER (WHERE status = 'bounced'))::int AS bounced,
               (count(*) FILTER (WHERE status = 'replied'))::int AS replied
        FROM base GROUP BY 1, 2
      ) d),
    'bounce_types', (
      SELECT coalesce(jsonb_agg(t), '[]'::jsonb)
      FROM (
        SELECT workspace_id, coalesce(bounce_type, 'unknown') AS bounce_type, count(*)::int AS n
        FROM base WHERE status = 'bounced' GROUP BY 1, 2
      ) t),
    'domains', (
      SELECT coalesce(jsonb_agg(x ORDER BY x.bounced DESC, x.sent DESC), '[]'::jsonb)
      FROM (
        SELECT dom.*, coalesce(active.n, 0) AS active_contacts
        FROM dom LEFT JOIN active USING (domain)
      ) x)
  );
$$;

GRANT EXECUTE ON FUNCTION public.send_health(integer) TO authenticated;
