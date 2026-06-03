-- =============================================================================
-- ColdReach — Phase 7 AI Opener cache columns
-- File: 0003_ai_opener.sql
-- Created: 2026-05-05
--
-- Adds cached AI-generated opener line per contact per workspace.
-- Cached so we don't re-generate on every send (saves Gemini quota).
-- =============================================================================

ALTER TABLE public.contact_workspace_data
  ADD COLUMN IF NOT EXISTS ai_opener TEXT,
  ADD COLUMN IF NOT EXISTS ai_opener_generated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_contact_workspace_ai_opener_pending
  ON public.contact_workspace_data(workspace_id)
  WHERE ai_opener IS NULL;
