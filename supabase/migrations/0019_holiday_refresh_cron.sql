-- =============================================================================
-- ColdReach — Daily refresh of id_holidays from api-harilibur
-- File: 0019_holiday_refresh_cron.sql
-- Created: 2026-05-12
--
-- ⚠ ONLY RUN AFTER:
--   1. Migration 0018_id_holidays.sql has been applied.
--   2. /api/cron/refresh-holidays is deployed to Vercel.
--
-- Replace placeholders before running:
--   __APP_URL__       e.g., https://coldreach-peach.vercel.app
--   __CRON_SECRET__   value of CRON_SECRET env var (must match deployed app)
--
-- Schedule: once per day at 02:00 WIB (19:00 UTC previous day). Avoids
-- colliding with the quota-reset job at 00:00 WIB / 17:00 UTC.
-- =============================================================================

SELECT cron.schedule(
  'coldreach-refresh-holidays',
  '0 19 * * *',  -- 19:00 UTC = 02:00 WIB next day
  $$
  SELECT net.http_get(
    url := '__APP_URL__/api/cron/refresh-holidays',
    headers := jsonb_build_object('X-Cron-Secret', '__CRON_SECRET__')
  );
  $$
);

-- =============================================================================
-- Bootstrap: kick off one immediate fetch so the table isn't empty on day-1.
-- Comment this out if you'd rather wait for the cron's first natural fire.
-- =============================================================================
SELECT net.http_get(
  url := '__APP_URL__/api/cron/refresh-holidays',
  headers := jsonb_build_object('X-Cron-Secret', '__CRON_SECRET__')
);

-- =============================================================================
-- Useful queries:
--
-- See current schedule:
--   SELECT jobid, jobname, schedule FROM cron.job WHERE jobname LIKE 'coldreach-%';
--
-- Force a refresh manually:
--   SELECT net.http_get(
--     url := '__APP_URL__/api/cron/refresh-holidays',
--     headers := jsonb_build_object('X-Cron-Secret', '__CRON_SECRET__')
--   );
--
-- Inspect table:
--   SELECT date, name, is_cuti_bersama, source, fetched_at
--   FROM public.id_holidays
--   WHERE date >= CURRENT_DATE
--   ORDER BY date ASC
--   LIMIT 20;
-- =============================================================================
