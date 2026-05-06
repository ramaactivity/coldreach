-- =============================================================================
-- ColdReach — Alternate emails per contact
-- File: 0008_alt_emails.sql
-- Created: 2026-05-06
--
-- Adds alt_emails text[] ke contacts. Use case: kontak yang punya >1 email
-- (primary + secondary). Primary tetap di kolom email (1:1, dipakai untuk
-- send), alt_emails nyimpen sisanya. UI bisa swap primary ↔ alt kapan aja.
--
-- Default empty array (bukan NULL) supaya query gak perlu COALESCE.
-- GIN index untuk substring/contains lookup yang cepat saat search.
-- =============================================================================

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS alt_emails TEXT[] NOT NULL DEFAULT '{}'::text[];

-- GIN index untuk @> (contains) dan ILIKE-on-text lookup
CREATE INDEX IF NOT EXISTS idx_contacts_alt_emails_gin
  ON public.contacts USING GIN (alt_emails);
