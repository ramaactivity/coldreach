-- =============================================================================
-- ColdReach — Engagement aggregates + stale archival groundwork
-- File: 0015_engagement_and_stale.sql
-- Created: 2026-05-07
--
-- Adds the per-contact engagement signals we need for:
--   - Stale-archiver cron (auto-archive contacts that ignored 5+ emails)
--   - Engagement scoring (warm-first sort in queue creation, UI badges)
--   - Unsubscribe flow (last_engaged_at lets us tell unsubs apart from
--     unread cold contacts in audits)
--
-- All columns are denormalised aggregates the runners maintain. Backfill
-- statements at the bottom seed values from existing campaign_recipients
-- so freshly-deployed code starts with correct numbers.
-- =============================================================================

-- 1. Engagement aggregates
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS total_opens_all_workspaces INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS total_replies_all_workspaces INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS last_engaged_at TIMESTAMPTZ;
  -- max(opened_at, replied_at) seen across any workspace

-- 2. Engagement score (0-100). Computed by application code, not a trigger,
-- so the formula stays easy to tune.
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS engagement_score INTEGER NOT NULL DEFAULT 0;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_contacts_engagement_score
  ON public.contacts(user_id, engagement_score DESC)
  WHERE archived_at IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_last_engaged
  ON public.contacts(user_id, last_engaged_at DESC NULLS LAST)
  WHERE archived_at IS NULL AND deleted_at IS NULL;


-- 3. Backfill from campaign_recipients (idempotent — uses MAX/SUM)
WITH agg AS (
  SELECT
    c.id AS contact_id,
    SUM(GREATEST(cr.open_count, 0)) AS opens,
    COUNT(*) FILTER (WHERE cr.replied_at IS NOT NULL) AS replies,
    MAX(GREATEST(
      COALESCE(cr.opened_at, '1970-01-01'::timestamptz),
      COALESCE(cr.replied_at, '1970-01-01'::timestamptz)
    )) AS last_engaged
  FROM public.contacts c
  LEFT JOIN public.campaign_recipients cr ON cr.contact_id = c.id
  GROUP BY c.id
)
UPDATE public.contacts c SET
  total_opens_all_workspaces = COALESCE(agg.opens, 0),
  total_replies_all_workspaces = COALESCE(agg.replies, 0),
  last_engaged_at = CASE
    WHEN agg.last_engaged > '1970-01-01'::timestamptz THEN agg.last_engaged
    ELSE NULL
  END
FROM agg
WHERE c.id = agg.contact_id;


-- 4. Initial engagement score backfill. Same formula the app uses so
-- numbers match after deploy. Capped at 100.
UPDATE public.contacts SET engagement_score = LEAST(100,
  LEAST(total_opens_all_workspaces, 20)              -- 1 pt per open, max 20
  + (total_replies_all_workspaces * 15)              -- 15 pt per reply
  + CASE
      WHEN last_engaged_at >= now() - interval '14 days' THEN 25
      WHEN last_engaged_at >= now() - interval '60 days' THEN 10
      ELSE 0
    END
);
