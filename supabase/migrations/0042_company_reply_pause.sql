-- =============================================================================
-- ColdReach — Pause colleagues once a company replies
-- File: 0042_company_reply_pause.sql
--
-- GoTo: 53 contacts, 40 emailed, 2 replied (one interested) — and colleagues
-- kept getting cold emails. domain_send_counts now also returns who at the
-- domain replied in the last 90 days; the queue-runner defers everyone else at
-- that company for 30 days, while the repliers themselves stay reachable.
-- =============================================================================

DROP FUNCTION IF EXISTS public.domain_send_counts(uuid, text[], timestamptz, timestamptz);

CREATE FUNCTION public.domain_send_counts(
  p_user_id uuid,
  p_domains text[],
  p_today_start timestamptz,
  p_window_start timestamptz
) RETURNS TABLE (domain text, today integer, recent integer, repliers text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT split_part(lower(cr.contact_email), '@', 2) AS domain,
         count(*) FILTER (WHERE cr.created_at >= p_today_start
                          AND cr.status IN ('sending','sent','opened','replied','bounced'))::int AS today,
         count(*) FILTER (WHERE cr.created_at >= p_window_start
                          AND cr.status IN ('sending','sent','opened','replied','bounced'))::int AS recent,
         coalesce(array_agg(DISTINCT lower(cr.contact_email))
                  FILTER (WHERE cr.status = 'replied' AND cr.replied_at >= now() - interval '90 days'),
                  '{}') AS repliers
  FROM public.campaign_recipients cr
  WHERE cr.user_id = p_user_id
    AND cr.created_at >= least(p_window_start, now() - interval '120 days')
    AND split_part(lower(cr.contact_email), '@', 2) = ANY (p_domains)
  GROUP BY 1;
$$;

REVOKE ALL ON FUNCTION public.domain_send_counts(uuid, text[], timestamptz, timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.domain_send_counts(uuid, text[], timestamptz, timestamptz) TO service_role;
