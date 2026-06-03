-- =============================================================================
-- ColdReach — Tag usage aggregation
-- File: 0011_tag_usage.sql
-- Created: 2026-05-06
--
-- Tags live as text[] on contacts. To list every distinct tag with a
-- contact-count, we unnest and group. Wrapped as a SQL function so we can
-- call it via RPC and Postgres can use the GIN index on contacts.tags
-- when scanning.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_tag_usage_for_user(uid UUID)
RETURNS TABLE (
  tag TEXT,
  contact_count INT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    t AS tag,
    COUNT(*)::int AS contact_count
  FROM public.contacts c, UNNEST(c.tags) AS t
  WHERE c.user_id = uid
    AND c.deleted_at IS NULL
    AND t IS NOT NULL
    AND t <> ''
  GROUP BY t
  ORDER BY contact_count DESC, t ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_tag_usage_for_user(UUID)
  TO anon, authenticated;
