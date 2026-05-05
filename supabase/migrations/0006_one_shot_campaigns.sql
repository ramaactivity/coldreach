-- =============================================================================
-- ColdReach — One-Shot Campaigns
-- File: 0006_one_shot_campaigns.sql
-- Created: 2026-05-06
--
-- Adds is_one_shot + scheduled_start_at to send_queues so a single table
-- can power both:
--   - Recurring queues (is_one_shot=false, default): cron respects
--     schedule_days/start_time/end_time, fires daily until pending=0
--   - One-shot campaigns (is_one_shot=true): cron ignores recurring window,
--     fires whenever scheduled_start_at <= now until pending=0, then auto
--     deactivates (is_active=false) signaling "completed"
--
-- This keeps send_queues as the unified store but lets UI present them as
-- two distinct concepts (Queues vs Campaigns).
-- =============================================================================

ALTER TABLE public.send_queues
  ADD COLUMN IF NOT EXISTS is_one_shot BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scheduled_start_at TIMESTAMPTZ;

-- Index for cron lookup of due one-shots
CREATE INDEX IF NOT EXISTS idx_send_queues_one_shot_due
  ON public.send_queues(is_one_shot, is_active, scheduled_start_at)
  WHERE is_one_shot = true AND is_active = true;
