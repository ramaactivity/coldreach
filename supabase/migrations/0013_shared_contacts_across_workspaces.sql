-- =============================================================================
-- ColdReach — Shared contacts across workspaces
-- File: 0013_shared_contacts_across_workspaces.sql
-- Created: 2026-05-07
--
-- Single-user multi-workspace setup: a contact uploaded under one workspace
-- should be reachable from every workspace owned by the same user. We keep
-- contact_workspace_data as the per-workspace state row (lead_stage,
-- last_contacted_at, ai_opener cache, etc.), but ensure every (contact,
-- workspace) pair under the same user has a row, so existing list/filter
-- queries that JOIN on contact_workspace_data return all contacts.
--
-- Two pieces:
--   1. Backfill: insert missing rows for all current (contact, workspace) pairs
--   2. Auto-link triggers: keep new contacts/workspaces in sync going forward
-- =============================================================================

-- 1. Backfill — idempotent (ON CONFLICT DO NOTHING)
INSERT INTO public.contact_workspace_data (contact_id, workspace_id, user_id)
SELECT c.id, w.id, c.user_id
FROM public.contacts c
JOIN public.workspaces w ON w.user_id = c.user_id
WHERE c.deleted_at IS NULL
ON CONFLICT (contact_id, workspace_id) DO NOTHING;


-- 2a. New workspace → auto-link to all existing contacts of that user
CREATE OR REPLACE FUNCTION public.link_existing_contacts_to_new_workspace()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.contact_workspace_data (contact_id, workspace_id, user_id)
  SELECT c.id, NEW.id, c.user_id
  FROM public.contacts c
  WHERE c.user_id = NEW.user_id
    AND c.deleted_at IS NULL
  ON CONFLICT (contact_id, workspace_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_workspace_link_contacts ON public.workspaces;
CREATE TRIGGER on_workspace_link_contacts
  AFTER INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.link_existing_contacts_to_new_workspace();


-- 2b. New contact → auto-link to all existing workspaces of that user
CREATE OR REPLACE FUNCTION public.link_new_contact_to_all_workspaces()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.contact_workspace_data (contact_id, workspace_id, user_id)
  SELECT NEW.id, w.id, NEW.user_id
  FROM public.workspaces w
  WHERE w.user_id = NEW.user_id
  ON CONFLICT (contact_id, workspace_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_contact_link_workspaces ON public.contacts;
CREATE TRIGGER on_contact_link_workspaces
  AFTER INSERT ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.link_new_contact_to_all_workspaces();
