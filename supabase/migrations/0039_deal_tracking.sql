-- =============================================================================
-- ColdReach — Deal tracking
-- File: 0039_deal_tracking.sql
--
-- Audit 2026-09-30: zero contacts ever reached a won/booked stage, so nothing
-- showed which templates or workspaces actually produce revenue. A closed
-- deal now records its value (IDR) and date on the workspace-scoped lead row;
-- the dashboard sums them per workspace and per template.
-- =============================================================================

ALTER TABLE public.contact_workspace_data
  ADD COLUMN IF NOT EXISTS deal_value NUMERIC(14, 0),
  ADD COLUMN IF NOT EXISTS deal_closed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cwd_deal_closed
  ON public.contact_workspace_data(workspace_id, deal_closed_at)
  WHERE deal_closed_at IS NOT NULL;
