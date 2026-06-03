-- =============================================================================
-- ColdReach — English subject variants
-- File: 0026_subject_lines_en.sql
-- Created: 2026-06-03
--
-- Templates already carry an English body (body_plain_en) that sendEmail uses
-- when a contact's language resolves to 'en'. The subject had no English
-- counterpart, so an English-language send went out with an English body but
-- an Indonesian subject. This adds the parallel English subject pool; when
-- empty, sends fall back to the Indonesian subject_lines.
-- =============================================================================

ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS subject_lines_en TEXT[];

COMMENT ON COLUMN public.templates.subject_lines_en IS
  'English subject-line variants, rotated per send for en-language contacts. NULL/empty => fall back to subject_lines.';
