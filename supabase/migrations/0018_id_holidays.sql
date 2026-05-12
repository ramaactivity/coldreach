-- =============================================================================
-- ColdReach — Auto-refreshing Indonesian holiday table
-- File: 0018_id_holidays.sql
-- Created: 2026-05-12
--
-- Replaces the hand-maintained holidays-id.ts list with a Supabase table that
-- gets refreshed daily from a public API (api-harilibur.vercel.app). The
-- hardcoded list in src/lib/holidays-id.ts stays as offline fallback.
--
-- Skip rule: queue-runner / followup-runner / similar cron paths check this
-- table first; if a row exists for today's WIB date, skip the run entirely.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.id_holidays (
  date DATE PRIMARY KEY,
  name TEXT NOT NULL,
  is_cuti_bersama BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'api-harilibur',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.id_holidays IS
  'Indonesian national holidays + cuti bersama, auto-refreshed daily by /api/cron/refresh-holidays.';

CREATE INDEX IF NOT EXISTS idx_id_holidays_date_desc
  ON public.id_holidays (date DESC);

-- RLS: any authenticated user can read (they need it for dashboard banner).
-- INSERT/UPDATE/DELETE only via service-role (no policy = blocked under RLS).
ALTER TABLE public.id_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Holidays readable by authenticated" ON public.id_holidays;
CREATE POLICY "Holidays readable by authenticated"
  ON public.id_holidays FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'anon');
