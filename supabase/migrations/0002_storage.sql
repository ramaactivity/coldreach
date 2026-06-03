-- =============================================================================
-- ColdReach — Storage Bucket Setup
-- File: 0002_storage.sql
-- Created: 2026-05-05
--
-- Creates Storage bucket for PDF attachments + RLS policies.
-- Run AFTER 0001_initial_schema.sql.
--
-- Path convention: {user_id}/{workspace_id}/{filename}
-- =============================================================================


-- =============================================================================
-- BUCKET: template-attachments
-- =============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'template-attachments',
  'template-attachments',
  false,                                                    -- private bucket
  5242880,                                                  -- 5 MB per file
  ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;


-- =============================================================================
-- RLS POLICIES on storage.objects (template-attachments bucket only)
-- =============================================================================

-- Users can upload to their own folder ({user_id}/...)
CREATE POLICY "Users upload own attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'template-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can read their own files
CREATE POLICY "Users read own attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'template-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can update (e.g., replace) their own files
CREATE POLICY "Users update own attachments"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'template-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete their own files
CREATE POLICY "Users delete own attachments"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'template-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- =============================================================================
-- DONE
-- Total Storage free tier: 1 GB. Per spec: ~ 1 PDF (1-2 MB) per workspace,
-- can hold thousands of attachments easily.
-- =============================================================================
