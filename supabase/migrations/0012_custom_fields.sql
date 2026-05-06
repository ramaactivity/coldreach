-- =============================================================================
-- ColdReach — Per-workspace custom fields
-- File: 0012_custom_fields.sql
-- Created: 2026-05-06
--
-- Each workspace defines its own array of custom field definitions:
--   [{ id: "budget_estimasi", label: "Budget Estimasi", type: "number",
--      required: false, hint: "..." }, ...]
--
-- Values are stored on the existing contacts.custom_fields JSONB column,
-- keyed by field id. Different workspaces edit different keys so a contact
-- shared across workspaces accumulates one bag with everyone's values.
-- =============================================================================

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS custom_fields_schema JSONB NOT NULL DEFAULT '[]'::jsonb;
