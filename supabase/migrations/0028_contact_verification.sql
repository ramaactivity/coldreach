-- =============================================================================
-- ColdReach — Contact email verification (Apollo enrichment, Phase 2)
-- File: 0028_contact_verification.sql
-- Created: 2026-06-03
--
-- Proactive bounce reduction: verify/refresh existing contacts' emails via
-- Apollo (people/bulk_match by email) BEFORE sending, instead of only
-- reacting to bounces after the fact. Three columns track the result.
--   enriched_at        = last time Apollo checked this contact
--   email_verified_at  = set when Apollo returned a usable email (verified/likely)
--   email_status       = raw Apollo status (verified/likely/unverified/
--                        unavailable/not_found/duplicate)
-- Derived filters: "Belum diverifikasi" = enriched_at IS NULL;
--                  "Berisiko" = enriched_at IS NOT NULL AND email_verified_at IS NULL.
-- =============================================================================

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_status TEXT;

COMMENT ON COLUMN public.contacts.enriched_at IS
  'Last time this contact was checked via Apollo enrichment.';
COMMENT ON COLUMN public.contacts.email_verified_at IS
  'Set when Apollo returned a usable (verified/likely) email. NULL after a check = risky.';
COMMENT ON COLUMN public.contacts.email_status IS
  'Raw Apollo email status: verified | likely | unverified | unavailable | not_found | duplicate.';

-- "Not yet verified" lookups.
CREATE INDEX IF NOT EXISTS idx_contacts_user_unenriched
  ON public.contacts (user_id) WHERE enriched_at IS NULL;
-- "Risky" lookups (checked but no usable email).
CREATE INDEX IF NOT EXISTS idx_contacts_user_risky
  ON public.contacts (user_id)
  WHERE enriched_at IS NOT NULL AND email_verified_at IS NULL;
