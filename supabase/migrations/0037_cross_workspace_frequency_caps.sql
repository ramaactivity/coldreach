-- =============================================================================
-- ColdReach — Cross-workspace frequency caps
-- File: 0037_cross_workspace_frequency_caps.sql
--
-- Audit 2026-09-29: 977 people were emailed by 2+ workspaces within 30 days
-- (370 of them within a week), and big corporate domains took 20–30 emails in
-- 14 days from four senders. Enterprise gateways read that as one spam
-- campaign. The queue-runner now caps sends per recipient DOMAIN across all of
-- the user's workspaces; this function gives it the counts in one round trip
-- (a plain select would hit PostgREST's 1000-row cap over 14 days).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.domain_send_counts(
  p_user_id uuid,
  p_domains text[],
  p_today_start timestamptz,
  p_window_start timestamptz
) RETURNS TABLE (domain text, today integer, recent integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT split_part(lower(cr.contact_email), '@', 2) AS domain,
         count(*) FILTER (WHERE cr.created_at >= p_today_start)::int AS today,
         count(*)::int AS recent
  FROM public.campaign_recipients cr
  WHERE cr.user_id = p_user_id
    AND cr.created_at >= p_window_start
    AND cr.status IN ('sending', 'sent', 'opened', 'replied', 'bounced')
    AND split_part(lower(cr.contact_email), '@', 2) = ANY (p_domains)
  GROUP BY 1;
$$;

REVOKE ALL ON FUNCTION public.domain_send_counts(uuid, text[], timestamptz, timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.domain_send_counts(uuid, text[], timestamptz, timestamptz) TO service_role;

-- Deferred queue rows (queue_recipients.scheduled_for_date) are filtered on
-- every tick; the existing idx on (status, scheduled_for_date) covers it.
