-- =============================================================================
-- ColdReach — Hermes request #2: priority, analytics labels, sender pool
-- File: 0045_hermes_priority_pool.sql
--
--   queue_recipients.segment / campaign  analytics labels from Hermes
--     (segment: corporate | venue | eo_wo | kampus | instansi; campaign: free
--     text). priority already exists: Hermes maps tinggi=1, normal=0, rendah=-1.
--   send_queues.email_account_id  pin a queue to one connected account. NULL =
--     the workspace's account (or its sender_workspace_id's). Lets Hermes Sales
--     run one queue per mailbox (pool), each with its own quota and warmup.
--   campaign_recipients.email_account_id  which mailbox sent the row, so the
--     reply poller of one mailbox never scans threads that live in another.
--     Backfilled from the workspace (or its sender workspace) account.
-- =============================================================================

ALTER TABLE public.queue_recipients
  ADD COLUMN IF NOT EXISTS segment text,
  ADD COLUMN IF NOT EXISTS campaign text;

DO $$ BEGIN
  ALTER TABLE public.queue_recipients
    ADD CONSTRAINT queue_recipients_segment_check
    CHECK (segment IN ('corporate', 'venue', 'eo_wo', 'kampus', 'instansi'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.send_queues
  ADD COLUMN IF NOT EXISTS email_account_id uuid
    REFERENCES public.email_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.campaign_recipients
  ADD COLUMN IF NOT EXISTS email_account_id uuid
    REFERENCES public.email_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_account_status
  ON public.campaign_recipients (email_account_id, status)
  WHERE email_account_id IS NOT NULL;

-- Backfill: every existing row was sent by its workspace's account, or by the
-- account of the workspace it borrows from (Hermes Sales → Tetraphoto).
UPDATE public.campaign_recipients cr
   SET email_account_id = ea.id
  FROM public.workspaces w
  JOIN public.email_accounts ea
    ON ea.workspace_id = COALESCE(w.sender_workspace_id, w.id)
 WHERE cr.workspace_id = w.id
   AND cr.email_account_id IS NULL;
