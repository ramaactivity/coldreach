-- =============================================================================
-- ColdReach — Structured email signature (logo + socials + WhatsApp)
-- File: 0021_signature_data.sql
-- Created: 2026-05-25
--
-- Replaces the broken `default_signature` text field (column never existed in
-- DB — silent writes meant no workspace had a saved signature) with a
-- structured `signature_data` jsonb that holds name, title, company, email,
-- phone, whatsapp, website, logo_url, brand_color, and a socials[] array.
--
-- Renderers in src/lib/signature.ts generate email-safe HTML + plain text
-- fallback at send time; queue-runner / followup-runner / inbox replies all
-- pick from the same single source of truth.
--
-- Also provisions a public `workspace-logos` storage bucket so users can
-- upload a logo from the Settings page. Path convention:
--   {user_id}/{workspace_id}/logo.{ext}
-- RLS lets anyone read (public bucket = signature renders need external URL),
-- only the owner can upload/replace/delete under their user_id folder.
-- =============================================================================

-- 1. Structured signature payload
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS signature_data jsonb;

COMMENT ON COLUMN public.workspaces.signature_data IS
  'Structured signature payload. Schema: { name, title, company, email, phone, whatsapp, website, logo_url, brand_color, socials:[{platform,url,label}] }. NULL = no signature appended.';

-- 2. Public bucket for workspace logos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'workspace-logos',
    'workspace-logos',
    true,
    524288,                                          -- 512 KB cap
    ARRAY['image/png','image/jpeg','image/webp','image/gif']
  )
  ON CONFLICT (id) DO UPDATE
    SET public = EXCLUDED.public,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3. Storage policies. Path layout: {user_id}/{workspace_id}/logo.{ext}
--    storage.foldername(name)[1] = user_id

DROP POLICY IF EXISTS "workspace_logos_read"   ON storage.objects;
DROP POLICY IF EXISTS "workspace_logos_insert" ON storage.objects;
DROP POLICY IF EXISTS "workspace_logos_update" ON storage.objects;
DROP POLICY IF EXISTS "workspace_logos_delete" ON storage.objects;

CREATE POLICY "workspace_logos_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'workspace-logos');

CREATE POLICY "workspace_logos_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'workspace-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "workspace_logos_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'workspace-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "workspace_logos_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'workspace-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
