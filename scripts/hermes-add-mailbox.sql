-- Add a second (third, …) mailbox to the Hermes Sales pool. Idempotent.
--
-- 1. Rama connects the new mailbox in Cold Reach → workspace "Hermes Sales" →
--    Pengaturan → "Hubungkan email domain sendiri" (SMTP/IMAP). Hermes Sales has
--    no account of its own yet, so the form accepts it.
-- 2. Replace the address below and run this script (Supabase SQL / Management API).
--    It starts warmup on the new mailbox and creates a queue pinned to it with
--    the same schedule + follow-ups as the primary Hermes queue.
-- 3. Optionally raise workspaces.daily_new_cap for hermes-sales (Draf Hermes
--    page → "Email baru per hari"); the pool's total is capped by it.
--
-- New drafts from Bruno are then spread over the queues by backlog; each queue
-- sends from its own mailbox with its own quota/warmup, and follow-ups +
-- replies stay on the mailbox that sent the first email.

DO $$
DECLARE
  new_email text := 'sales@DOMAIN-KEDUA.com';   -- ← ganti
  ws uuid;
  acc uuid;
  primary_q record;
BEGIN
  SELECT id INTO ws FROM public.workspaces WHERE slug = 'hermes-sales';
  SELECT id INTO acc FROM public.email_accounts
   WHERE workspace_id = ws AND lower(email) = lower(new_email) AND is_active;
  IF acc IS NULL THEN
    RAISE EXCEPTION 'Mailbox % belum tersambung di workspace Hermes Sales', new_email;
  END IF;

  -- A brand-new mailbox ramps up: 20 → 40 → 60 → 80 → full over 30 days.
  UPDATE public.email_accounts
     SET warmup_mode = true,
         warmup_started_at = COALESCE(warmup_started_at, now()),
         daily_quota = LEAST(daily_quota, 30)
   WHERE id = acc;

  IF NOT EXISTS (SELECT 1 FROM public.send_queues WHERE email_account_id = acc) THEN
    SELECT * INTO primary_q FROM public.send_queues
     WHERE workspace_id = ws AND is_one_shot = false AND email_account_id IS NULL
     ORDER BY created_at LIMIT 1;
    INSERT INTO public.send_queues
      (user_id, workspace_id, name, template_id, template_ids, audience_filter, is_active,
       schedule_days, schedule_start_time, schedule_end_time, daily_target,
       followup_enabled, followup_steps, use_ai_opener, cold_mode, test_mode, email_account_id)
    VALUES
      (primary_q.user_id, ws, 'Hermes — ' || new_email, primary_q.template_id, primary_q.template_ids,
       '{"type":"manual"}'::jsonb, true,
       primary_q.schedule_days, primary_q.schedule_start_time, primary_q.schedule_end_time, 30,
       primary_q.followup_enabled, primary_q.followup_steps, false, true, false, acc);
  END IF;
END $$;
