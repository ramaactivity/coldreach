-- One-off, idempotent setup for the "Hermes Sales" workspace (run via the
-- Supabase Management API or SQL editor after 0043_hermes_drafts.sql).
-- Owner = the user who owns the existing "tetraphoto" workspace.
--
-- Creates: workspace hermes-sales (Mon–Fri 08:00–16:00 WIB, approval manual,
-- 15 new emails/day), two follow-up templates, a fallback first-touch template
-- (the runner requires one; Hermes rows always carry their own subject/body),
-- and one manual-audience queue with follow-ups on day 4 and day 7.
-- The sender account is connected afterwards in Settings (SMTP/IMAP form).
-- The app's workspace cache refreshes within 10 minutes (unstable_cache TTL).

DO $$
DECLARE
  uid uuid;
  ws uuid;
  fb uuid;
  f1 uuid;
  f2 uuid;
  fu1 text := E'Halo Bapak/Ibu,\n\nMenyambung email saya beberapa hari lalu: kalau {company} sedang menyiapkan gathering, anniversary, atau acara akhir tahun, saya dengan senang hati mengirimkan pricelist photobooth Tetra beserta beberapa contoh desain frame yang pernah kami buat untuk acara kantor. Cukup balas email ini, nanti saya kirimkan.\n\nKalau belum relevan, balas "stop" saja dan saya tidak akan mengirim email lagi.\n\nSalam,';
  fu2 text := E'Halo Bapak/Ibu,\n\nIni email terakhir dari saya soal photobooth untuk acara {company}. Kalau suatu saat dibutuhkan, pricelist dan contoh frame kami siap saya kirim kapan saja, cukup balas email ini.\n\nKalau tidak relevan, balas "stop" dan saya tidak akan menghubungi lagi. Terima kasih atas waktunya.\n\nSalam,';
  fbody text := E'Halo Bapak/Ibu,\n\nSaya Rama dari Tetra Photobooth. Kami menyiapkan photobooth dengan cetak instan dan desain frame khusus untuk acara kantor seperti gathering, anniversary, dan year-end party.\n\nApakah {company} punya acara dalam waktu dekat yang bisa kami bantu siapkan?\n\nSalam,';
BEGIN
  SELECT user_id INTO uid FROM public.workspaces WHERE slug = 'tetraphoto';
  IF uid IS NULL THEN RAISE EXCEPTION 'owner not found (workspace tetraphoto)'; END IF;

  SELECT id INTO ws FROM public.workspaces WHERE user_id = uid AND slug = 'hermes-sales';
  IF ws IS NULL THEN
    INSERT INTO public.workspaces
      (user_id, name, slug, description, business_type, color_theme, pipeline_stages,
       schedule_days, schedule_start_time, schedule_end_time, daily_target,
       signature_data, approval_mode, daily_new_cap, display_order)
    SELECT uid, 'Hermes Sales', 'hermes-sales',
           'Draf personal dari agent sales Hermes, dikirim setelah disetujui.',
           'photography', '#0f766e', pipeline_stages,
           '{1,2,3,4,5}', '08:00', '16:00', 15,
           jsonb_build_object('name', 'Rama — Tetra Photobooth', 'website', 'tetraphoto.com'),
           'manual', 15,
           COALESCE((SELECT max(display_order) + 1 FROM public.workspaces WHERE user_id = uid), 0)
    FROM public.workspaces WHERE slug = 'tetraphoto' AND user_id = uid
    RETURNING id INTO ws;
  END IF;

  SELECT id INTO fb FROM public.templates WHERE workspace_id = ws AND name = 'Hermes — cadangan' AND deleted_at IS NULL;
  IF fb IS NULL THEN
    INSERT INTO public.templates (user_id, workspace_id, name, category, subject_lines, body_plain, body_html, variables_used)
    VALUES (uid, ws, 'Hermes — cadangan', NULL, ARRAY['photobooth untuk acara {company}'], fbody,
            '<p>' || replace(fbody, E'\n\n', '</p><p>') || '</p>', ARRAY['company'])
    RETURNING id INTO fb;
  END IF;

  SELECT id INTO f1 FROM public.templates WHERE workspace_id = ws AND name = 'Hermes — Follow-up 1' AND deleted_at IS NULL;
  IF f1 IS NULL THEN
    INSERT INTO public.templates (user_id, workspace_id, name, category, subject_lines, body_plain, body_html, variables_used)
    VALUES (uid, ws, 'Hermes — Follow-up 1', 'follow-up', ARRAY['pricelist photobooth'], fu1,
            '<p>' || replace(fu1, E'\n\n', '</p><p>') || '</p>', ARRAY['company'])
    RETURNING id INTO f1;
  END IF;

  SELECT id INTO f2 FROM public.templates WHERE workspace_id = ws AND name = 'Hermes — Follow-up 2' AND deleted_at IS NULL;
  IF f2 IS NULL THEN
    INSERT INTO public.templates (user_id, workspace_id, name, category, subject_lines, body_plain, body_html, variables_used)
    VALUES (uid, ws, 'Hermes — Follow-up 2', 'follow-up', ARRAY['pricelist photobooth'], fu2,
            '<p>' || replace(fu2, E'\n\n', '</p><p>') || '</p>', ARRAY['company'])
    RETURNING id INTO f2;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.send_queues WHERE workspace_id = ws AND is_one_shot = false) THEN
    INSERT INTO public.send_queues
      (user_id, workspace_id, name, template_id, template_ids, audience_filter, is_active,
       schedule_days, schedule_start_time, schedule_end_time, daily_target,
       followup_enabled, followup_steps, use_ai_opener, cold_mode, test_mode)
    VALUES
      (uid, ws, 'Hermes — draf personal', fb, ARRAY[fb], '{"type":"manual"}'::jsonb, true,
       '{1,2,3,4,5}', '08:00', '16:00', 15,
       true,
       jsonb_build_array(
         jsonb_build_object('template_id', f1, 'after_days', 4),
         jsonb_build_object('template_id', f2, 'after_days', 3)),
       false, true, false);
  END IF;
END $$;
