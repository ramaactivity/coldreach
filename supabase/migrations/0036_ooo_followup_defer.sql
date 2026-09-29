-- =============================================================================
-- ColdReach — Out-of-office aware follow-ups
-- File: 0036_ooo_followup_defer.sql
--
-- Auto-replies ("I'm on leave until 6 Oct", "Sedang cuti sampai …") used to be
-- dropped by the reply poller. Now the poller records the recipient's return
-- date on every campaign_recipient in the thread, and the follow-up runner
-- holds the next step until the day after that date.
--   ooo_until       — date the recipient is back (parsed, or a default guess)
--   ooo_detected_at — received time of the auto-reply that set it, so the
--                     poller only reprocesses a NEWER auto-reply.
-- =============================================================================

ALTER TABLE public.campaign_recipients
  ADD COLUMN IF NOT EXISTS ooo_until DATE,
  ADD COLUMN IF NOT EXISTS ooo_detected_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_ooo_until
  ON public.campaign_recipients(ooo_until) WHERE ooo_until IS NOT NULL;
