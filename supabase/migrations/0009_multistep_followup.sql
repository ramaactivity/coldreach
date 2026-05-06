-- =============================================================================
-- ColdReach — Multi-step Follow-up Sequence
-- File: 0009_multistep_followup.sql
-- Created: 2026-05-06
--
-- Adds followup_steps JSONB ke send_queues — array of
--   { template_id: uuid_text, after_days: int }
-- Step 1 = first follow-up, fired N1 days after original sent
-- Step 2 = second follow-up, fired N2 days after step 1 sent
-- Step 3 = etc.
--
-- Legacy fields followup_enabled + followup_template_id + followup_after_days
-- tetap ada untuk backward compat. Backfill: kalau legacy aktif, copy ke
-- followup_steps[0]. Going forward, runner pakai followup_steps array.
-- =============================================================================

ALTER TABLE public.send_queues
  ADD COLUMN IF NOT EXISTS followup_steps JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill: any queue with legacy single-step config gets a single-element
-- followup_steps array.
UPDATE public.send_queues
SET followup_steps = jsonb_build_array(
  jsonb_build_object(
    'template_id', followup_template_id::text,
    'after_days', COALESCE(followup_after_days, 4)
  )
)
WHERE followup_enabled = true
  AND followup_template_id IS NOT NULL
  AND (followup_steps IS NULL OR jsonb_array_length(followup_steps) = 0);
