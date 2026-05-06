-- =============================================================================
-- ColdReach — Reply Inbox state
-- File: 0007_reply_inbox.sql
-- Created: 2026-05-06
--
-- Adds handled_at + snoozed_until ke campaign_recipients supaya halaman Inbox
-- bisa filter:
--   - Pending  : status='replied' AND handled_at IS NULL
--                AND (snoozed_until IS NULL OR snoozed_until <= now())
--   - Snoozed  : status='replied' AND handled_at IS NULL
--                AND snoozed_until > now()
--   - Handled  : status='replied' AND handled_at IS NOT NULL
--
-- Status tetap 'replied' supaya stats lain (replied_7d, dll) gak rusak.
-- =============================================================================

ALTER TABLE public.campaign_recipients
  ADD COLUMN IF NOT EXISTS handled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ;

-- Index untuk inbox lookup (pending replies per workspace)
CREATE INDEX IF NOT EXISTS idx_recipients_inbox_pending
  ON public.campaign_recipients(workspace_id, replied_at DESC)
  WHERE status = 'replied' AND handled_at IS NULL;
