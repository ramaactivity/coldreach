-- =============================================================================
-- ColdReach — Bounce intelligence + manual archive
-- File: 0014_bounce_intel_and_archive.sql
-- Created: 2026-05-07
--
-- Adds the columns the bounce-detector needs to distinguish hard/soft/block/
-- spam, count repeat soft failures, and let the user manually archive
-- contacts ("don't email me again, but keep the record"). Plus a couple of
-- indexes so dashboard queries stay fast as the contacts table grows.
-- =============================================================================

-- 1. campaign_recipients: classify bounces
ALTER TABLE public.campaign_recipients
  ADD COLUMN IF NOT EXISTS bounce_type TEXT;
  -- expected values: 'hard' | 'soft' | 'block' | 'spam' | NULL


-- 2. contacts: bounce counters + manual archive flag
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS bounce_count INT NOT NULL DEFAULT 0;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS last_bounce_at TIMESTAMPTZ;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS last_bounce_type TEXT;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
  -- when set, the user explicitly archived; UI hides by default

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;
  -- 'hard_bounce' | 'soft_bounce_threshold' | 'domain_blocked' |
  -- 'manual' | 'unsubscribed' | 'spam_complaint'


-- 3. Indexes for the queries we run on every dashboard / queue creation
CREATE INDEX IF NOT EXISTS idx_contacts_archived
  ON public.contacts(user_id) WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_active_unarchived
  ON public.contacts(user_id, status) WHERE archived_at IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_bounce_type
  ON public.campaign_recipients(workspace_id, bounce_type) WHERE bounce_type IS NOT NULL;
