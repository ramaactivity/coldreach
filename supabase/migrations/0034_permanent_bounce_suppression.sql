-- =============================================================================
-- ColdReach — Permanent bounce suppression across workspaces
-- File: 0034_permanent_bounce_suppression.sql
-- Created: 2026-09-10
--
-- PROBLEM: When a contact's email bounces from workspace A, the bounced
-- campaign_recipients row eventually ages past the 3-day dedup window.
-- Workspace B then re-sends to the same dead address, wasting sends and
-- further damaging sender reputation.
--
-- FIX: Make bounce suppression PERMANENT in claim_contact_send: if ANY
-- campaign_recipients row for this user + email has status 'bounced', the
-- claim returns NULL (no send). No time limit — once bounced, never again.
--
-- BACKFILL: Archive all contacts that have bounced campaign_recipients but
-- whose contact row is still status='active' and not archived. Then skip
-- any pending queue_recipients pointing at those contacts.
-- =============================================================================

-- 1. Fix claim_contact_send: add permanent bounce guard
CREATE OR REPLACE FUNCTION public.claim_contact_send(
  p_user_id uuid,
  p_workspace_id uuid,
  p_contact_id uuid,
  p_contact_email text,
  p_cutoff timestamptz
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(lower(p_contact_email), 0));

  -- PERMANENT bounce suppression: if this email ever bounced under this
  -- user (any workspace, any time), refuse the claim outright. A bounced
  -- address doesn't un-bounce — re-sending only burns quota and damages
  -- sender reputation.
  IF EXISTS (
    SELECT 1
    FROM public.campaign_recipients cr
    WHERE cr.user_id = p_user_id
      AND lower(cr.contact_email) = lower(p_contact_email)
      AND cr.status = 'bounced'
    LIMIT 1
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.campaign_recipients
    (campaign_id, contact_id, user_id, workspace_id, contact_email, status)
  SELECT NULL, p_contact_id, p_user_id, p_workspace_id, p_contact_email, 'sending'
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.campaign_recipients cr
    WHERE cr.user_id = p_user_id
      AND lower(cr.contact_email) = lower(p_contact_email)
      AND cr.created_at >= p_cutoff
      AND cr.status IN ('sending', 'sent', 'opened', 'replied')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


-- 2. Backfill: archive contacts that have bounced campaign_recipients
--    but whose contact row is still active + unarchived.
--    This catches the gap where bounce_detector only processed some
--    workspaces, or where the contact was only soft-bounced once.
WITH bounced_contact_ids AS (
  SELECT DISTINCT cr.contact_id
  FROM public.campaign_recipients cr
  WHERE cr.status = 'bounced'
    AND cr.contact_id IS NOT NULL
),
needs_archive AS (
  SELECT c.id
  FROM public.contacts c
  JOIN bounced_contact_ids b ON b.contact_id = c.id
  WHERE c.status = 'active'
    AND c.archived_at IS NULL
    AND c.deleted_at IS NULL
)
UPDATE public.contacts
SET status = 'bounced',
    archived_at = NOW(),
    archive_reason = 'hard_bounce'
FROM needs_archive
WHERE contacts.id = needs_archive.id;


-- 3. Backfill: skip all pending queue_recipients for archived contacts.
--    This prevents the queue-runner from waking up to process contacts
--    that are already known to be dead.
UPDATE public.queue_recipients qr
SET status = 'skipped'
FROM public.contacts c
WHERE qr.contact_id = c.id
  AND qr.status = 'pending'
  AND (c.archived_at IS NOT NULL OR c.status IN ('bounced', 'blocked'));


-- 4. Index to support the permanent bounce check in claim_contact_send.
--    The existing idx_cr_dedup_lookup covers (user_id, lower(email), created_at)
--    with a status filter, but the new bounce guard queries ALL time with
--    status = 'bounced' specifically.
CREATE INDEX IF NOT EXISTS idx_cr_bounced_email
  ON public.campaign_recipients (user_id, lower(contact_email))
  WHERE status = 'bounced';
