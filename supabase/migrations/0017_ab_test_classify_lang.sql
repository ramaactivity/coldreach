-- =============================================================================
-- ColdReach — A/B subject test, reply classification, multi-language body
-- File: 0017_ab_test_classify_lang.sql
-- Created: 2026-05-07
--
-- All three features bolt onto existing tables; no new tables.
-- =============================================================================

-- 1. A/B subject testing
-- templates.subject_lines is already TEXT[]; we just need to know which
-- index of the array was actually used per send so we can compute per-
-- variant open/reply rates. NULL = legacy rows from before this rolled
-- out.
ALTER TABLE public.campaign_recipients
  ADD COLUMN IF NOT EXISTS subject_line_index SMALLINT;


-- 2. Reply auto-classification (Gemini)
-- Set by reply-detector after Gemini classifies the reply body.
ALTER TABLE public.campaign_recipients
  ADD COLUMN IF NOT EXISTS reply_classification TEXT;
  -- expected values: 'interested' | 'not_interested' | 'out_of_office'
  --                | 'question' | 'unsubscribe_request' | 'other' | NULL


-- 3. Multi-language template body
-- Templates default to body_plain (Indonesian). Optional body_plain_en
-- carries the English variant. Contacts get language_pref 'id' (default)
-- or 'en' so the runner can pick the right body per recipient.
ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS body_plain_en TEXT;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS language_pref TEXT NOT NULL DEFAULT 'id';
  -- 'id' | 'en'


-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_subject_variant
  ON public.campaign_recipients(workspace_id, subject_line_index)
  WHERE subject_line_index IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_classification
  ON public.campaign_recipients(workspace_id, reply_classification)
  WHERE reply_classification IS NOT NULL;
