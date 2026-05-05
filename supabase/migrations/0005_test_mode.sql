-- =============================================================================
-- ColdReach — Queue Test Mode
-- File: 0005_test_mode.sql
-- Created: 2026-05-05
--
-- Adds test_mode flag to send_queues. When true:
-- - Queue runner overrides recipient email → connected Gmail account email
-- - Subject prefixed with [TEST]
-- - Cron auto-runner SKIPS this queue (only manual Run Now triggers send)
-- - Queue UI shows prominent TEST MODE banner
--
-- This is a SAFETY mechanism so user can test queue logic against real
-- audience filters without actually emailing customers.
-- =============================================================================

ALTER TABLE public.send_queues
  ADD COLUMN IF NOT EXISTS test_mode BOOLEAN NOT NULL DEFAULT false;
