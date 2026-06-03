-- =============================================================================
-- ColdReach — Manual holiday management
-- File: 0024_holidays_manual_management.sql
-- Created: 2026-06-03
--
-- Adds user-managed control on top of the auto-refreshed id_holidays table
-- (0018). The daily refresh from public APIs (date.nager.at + dayoffapi) is
-- incomplete — e.g. it missed Idul Adha 1447 H entirely for 2026 — and the
-- hardcoded fallback had the wrong date (2026-06-08 vs the real ~2026-05-27),
-- which leaked into the dashboard banner. Users now need to add, correct,
-- disable, and delete holidays from a UI, and those decisions must survive
-- the daily refresh.
--
--   is_manual = true  -> the row was created/edited/overridden by a user.
--                        refreshHolidays() skips these dates so it never
--                        clobbers a manual decision.
--   enabled   = false -> holiday is disabled; cron senders ignore it and
--                        send that day anyway. Readers filter on enabled.
-- =============================================================================

ALTER TABLE public.id_holidays
  ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enabled   BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.id_holidays.is_manual IS
  'User created/edited/overrode this row. Daily refresh skips these dates so manual decisions are never overwritten.';
COMMENT ON COLUMN public.id_holidays.enabled IS
  'false = holiday disabled; cron senders still run that day. Readers (banner + cron skip) only treat enabled=true rows as holidays.';

-- Speeds up the "give me enabled holidays in this window" reads used by the
-- dashboard banner and cron skip checks.
CREATE INDEX IF NOT EXISTS idx_id_holidays_enabled_date
  ON public.id_holidays (date) WHERE enabled;
