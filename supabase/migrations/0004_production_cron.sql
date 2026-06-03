-- =============================================================================
-- ColdReach — Production cron schedule
-- File: 0004_production_cron.sql
-- Created: 2026-05-05
--
-- Schedules pg_cron jobs that hit our Next.js API routes via pg_net.
-- ⚠ ONLY RUN AFTER DEPLOYING TO VERCEL — uses public app URL.
--
-- Replace the placeholders below before running:
--   <APP_URL>       e.g., https://coldreach.vercel.app
--   <CRON_SECRET>   value of CRON_SECRET env var (must match the deployed app)
--
-- Pre-req: pg_cron extension enabled (Database → Extensions in Supabase dashboard).
-- =============================================================================

-- 1. Queue runner — every 30 minutes during business hours
--    08:00-18:00 WIB = 01:00-11:00 UTC
SELECT cron.schedule(
  'coldreach-queue-runner',
  '*/30 1-11 * * 1-5',   -- Mon-Fri only
  $$
  SELECT net.http_get(
    url := '<APP_URL>/api/cron/queue-runner',
    headers := jsonb_build_object('X-Cron-Secret', '<CRON_SECRET>')
  );
  $$
);

-- 2. Reply poller — every 15 minutes, 24/7 (replies can arrive anytime)
SELECT cron.schedule(
  'coldreach-reply-poller',
  '*/15 * * * *',
  $$
  SELECT net.http_get(
    url := '<APP_URL>/api/cron/reply-poller',
    headers := jsonb_build_object('X-Cron-Secret', '<CRON_SECRET>')
  );
  $$
);

-- 3. Follow-up runner — every hour during business hours
SELECT cron.schedule(
  'coldreach-followup-runner',
  '0 1-11 * * 1-5',
  $$
  SELECT net.http_get(
    url := '<APP_URL>/api/cron/followup-runner',
    headers := jsonb_build_object('X-Cron-Secret', '<CRON_SECRET>')
  );
  $$
);

-- 4. Daily quota reset — every day at 00:00 WIB (17:00 UTC previous day)
SELECT cron.schedule(
  'coldreach-quota-reset',
  '0 17 * * *',   -- 17:00 UTC = 00:00 WIB next day
  $$ SELECT public.reset_daily_quotas() $$
);

-- =============================================================================
-- Useful queries:
--
-- List scheduled jobs:
--   SELECT jobid, jobname, schedule, command FROM cron.job;
--
-- See job execution history:
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 50;
--
-- Unschedule a job (if you need to redeploy with different URL):
--   SELECT cron.unschedule('coldreach-queue-runner');
-- =============================================================================
