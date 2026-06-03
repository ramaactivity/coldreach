-- =============================================================================
-- ColdReach — Apollo auto-sourcing
-- File: 0027_apollo_sourcing.sql
-- Created: 2026-06-03
--
-- Adds in-app Apollo lead sourcing (search Apollo's DB → reveal → import as
-- contacts) alongside the existing CSV import. Two pieces of state:
--   - contacts.apollo_id: the Apollo person id, so a contact already sourced
--     can be deduped BEFORE spending a credit to reveal its email again.
--   - users.apollo_*: per-account credit config so we can show remaining
--     quota + a "use it before it resets" reminder. Apollo's live balance
--     isn't exposed via API, so we estimate from credits spent via ColdReach
--     (logged in activity_log) against a configurable monthly limit, with an
--     optional manual sync baseline.
-- =============================================================================

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS apollo_id TEXT;

COMMENT ON COLUMN public.contacts.apollo_id IS
  'Apollo person id (when sourced via Apollo). Used to dedupe before spending a reveal credit.';

CREATE INDEX IF NOT EXISTS idx_contacts_user_apollo
  ON public.contacts (user_id, apollo_id) WHERE apollo_id IS NOT NULL;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS apollo_credit_limit INTEGER NOT NULL DEFAULT 2560,
  ADD COLUMN IF NOT EXISTS apollo_cycle_reset_day SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS apollo_credits_synced_remaining INTEGER,
  ADD COLUMN IF NOT EXISTS apollo_credits_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN public.users.apollo_credit_limit IS
  'Apollo monthly credit allowance (Basic plan = 2560). Used for the remaining-quota estimate.';
COMMENT ON COLUMN public.users.apollo_cycle_reset_day IS
  'Day of month the Apollo credit cycle resets (1-28).';
COMMENT ON COLUMN public.users.apollo_credits_synced_remaining IS
  'Optional manual baseline: actual remaining credits read from the Apollo portal.';
COMMENT ON COLUMN public.users.apollo_credits_synced_at IS
  'When apollo_credits_synced_remaining was last set — spend after this is subtracted from it.';
