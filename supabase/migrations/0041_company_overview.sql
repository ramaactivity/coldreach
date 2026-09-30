-- =============================================================================
-- ColdReach — Company overview
-- File: 0041_company_overview.sql
--
-- Big corporates hold dozens of contacts that were emailed one by one from
-- four workspaces. This rolls contacts up by email domain so the team can see,
-- per company: how many people, how many were emailed (any workspace), who
-- replied, how many bounced, when it was last touched, and deals closed.
-- SECURITY INVOKER: RLS on contacts/campaign_recipients scopes it to the
-- signed-in user.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.company_overview(
  p_workspace_id uuid,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 200
) RETURNS TABLE (
  domain text, company text, contacts integer, active integer,
  emailed integer, replied integer, bounced integer,
  last_contacted timestamptz, deals integer, deal_value numeric
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH c AS (
    SELECT ct.id, split_part(lower(ct.email), '@', 2) AS domain, ct.company,
           (ct.status = 'active' AND ct.archived_at IS NULL) AS is_active
    FROM public.contacts ct
    WHERE ct.deleted_at IS NULL
  ), cr AS (
    SELECT r.contact_id,
           bool_or(r.sent_at IS NOT NULL) AS emailed,
           bool_or(r.status = 'replied') AS replied,
           bool_or(r.status = 'bounced') AS bounced,
           max(r.sent_at) AS last_sent
    FROM public.campaign_recipients r
    GROUP BY r.contact_id
  )
  SELECT c.domain,
         mode() WITHIN GROUP (ORDER BY c.company) AS company,
         count(*)::int,
         count(*) FILTER (WHERE c.is_active)::int,
         count(*) FILTER (WHERE cr.emailed)::int,
         count(*) FILTER (WHERE cr.replied)::int,
         count(*) FILTER (WHERE cr.bounced)::int,
         max(cr.last_sent),
         count(cwd.deal_closed_at)::int,
         coalesce(sum(cwd.deal_value), 0)
  FROM c
  LEFT JOIN cr ON cr.contact_id = c.id
  LEFT JOIN public.contact_workspace_data cwd
    ON cwd.contact_id = c.id AND cwd.workspace_id = p_workspace_id
  WHERE c.domain <> ''
    AND (p_search IS NULL OR c.domain ILIKE '%' || p_search || '%' OR c.company ILIKE '%' || p_search || '%')
  GROUP BY c.domain
  ORDER BY count(*) FILTER (WHERE cr.replied) DESC, count(*) DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.company_overview(uuid, text, integer) TO authenticated;
