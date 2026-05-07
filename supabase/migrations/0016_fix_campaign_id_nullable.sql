-- =============================================================================
-- ColdReach — Critical fix: campaign_id nullable + historical backfill
-- File: 0016_fix_campaign_id_nullable.sql
-- Created: 2026-05-07
--
-- Bug: campaign_recipients.campaign_id was declared NOT NULL in 0001 but the
-- queue-runner has been inserting with `campaign_id: null` (queues don't
-- belong to a campaign — campaigns are the one-shot sibling of recurring
-- queues). Every insert silently failed at the DB layer; the JS client
-- doesn't throw, so queue-runner kept marching forward, sending real
-- emails via Gmail, ticking up email_accounts.emails_sent_today and
-- send_queues.total_sent — but never recording a campaign_recipient row.
--
-- Consequences observed in prod:
--   - Dashboard SENT (7D) = 0 even though 90 emails went out today.
--   - Bounce-detector, reply-detector, open-tracking pixel — all rely on
--     campaign_recipients to know which contact a Gmail message belongs
--     to. Zero rows = zero matches = zero bounces / opens / replies
--     surfaced anywhere in the UI.
--   - `queue_recipients.campaign_recipient_id` was always NULL.
--
-- Fix:
--   1. Drop NOT NULL on campaign_id so future inserts succeed.
--   2. Backfill campaign_recipients from queue_recipients for every send
--      we orphaned. Status, sent_at, contact_email, ids — everything we
--      can recover. We can't recover gmail_message_id / gmail_thread_id
--      (those came from the Gmail API response and weren't persisted
--      anywhere); that limits historical bounce/reply matching, but
--      everything from this migration forward will be intact.
-- =============================================================================

-- 1. Drop the bogus NOT NULL constraint
ALTER TABLE public.campaign_recipients
  ALTER COLUMN campaign_id DROP NOT NULL;


-- 2. Backfill missing campaign_recipients rows from queue_recipients
--    where the queue runner sent but couldn't persist the recipient row.
WITH inserted AS (
  INSERT INTO public.campaign_recipients (
    campaign_id, contact_id, user_id, workspace_id, contact_email,
    status, sent_at, created_at, updated_at
  )
  SELECT
    NULL,
    qr.contact_id,
    qr.user_id,
    qr.workspace_id,
    c.email,
    -- Best-effort status mapping from queue_recipients to campaign_recipients
    CASE qr.status
      WHEN 'sent'    THEN 'sent'
      WHEN 'replied' THEN 'replied'
      WHEN 'bounced' THEN 'bounced'
      WHEN 'skipped' THEN 'failed'
      ELSE 'sent'
    END,
    qr.sent_at,
    COALESCE(qr.sent_at, qr.created_at, now()),
    now()
  FROM public.queue_recipients qr
  JOIN public.contacts c ON c.id = qr.contact_id
  WHERE qr.campaign_recipient_id IS NULL
    AND qr.status IN ('sent', 'replied', 'bounced')
    AND qr.sent_at IS NOT NULL
  RETURNING id, contact_id, workspace_id, sent_at
)
-- 3. Link queue_recipients back to the freshly-created campaign_recipients
UPDATE public.queue_recipients qr SET
  campaign_recipient_id = i.id
FROM inserted i
WHERE qr.contact_id = i.contact_id
  AND qr.workspace_id = i.workspace_id
  AND qr.sent_at = i.sent_at
  AND qr.campaign_recipient_id IS NULL;
