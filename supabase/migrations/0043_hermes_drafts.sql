-- =============================================================================
-- ColdReach — Hermes sales agent: per-recipient drafts + approval gate
-- File: 0043_hermes_drafts.sql
--
-- Hermes (AI sales agent) pushes researched prospects + a personal draft per
-- company through /api/mcp. Sending still goes through queue-runner →
-- claim_contact_send → sendEmail, so every existing guardrail applies.
--
--   queue_recipients.custom_subject/custom_body  per-recipient email, sent
--     instead of the queue template (no AI opener)
--   queue_recipients.external_ref  Tetra Ops prospek id, unique per queue
--     (idempotent draf_kirim)
--   queue_recipients.status_reason  why a row was cancelled or deferred
--   queue_recipients.status 'awaiting_approval'  the runner only picks
--     'pending', so these rows wait until the owner approves them
--   workspaces.approval_mode  NULL = workspace takes no external drafts;
--     'manual' = drafts wait for approval; 'auto' = drafts go straight to pending
--   workspaces.daily_new_cap  max first-touch emails per WIB day for the
--     whole workspace (NULL = no cap beyond quota/queue target)
--   campaign_recipients.reply_snippet  reply text, quotes stripped, ≤2000 chars
--
-- refill_queue: contacts Hermes created (source='hermes') never flow into an
-- evergreen 'all'/'deliverable' audience of another workspace. A 'tag'
-- audience is an explicit choice and still sees them.
-- =============================================================================

ALTER TABLE public.queue_recipients
  ADD COLUMN IF NOT EXISTS custom_subject text,
  ADD COLUMN IF NOT EXISTS custom_body text,
  ADD COLUMN IF NOT EXISTS external_ref text,
  ADD COLUMN IF NOT EXISTS status_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_recipients_external_ref
  ON public.queue_recipients (queue_id, external_ref)
  WHERE external_ref IS NOT NULL;

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS approval_mode text,
  ADD COLUMN IF NOT EXISTS daily_new_cap integer;

DO $$ BEGIN
  ALTER TABLE public.workspaces
    ADD CONSTRAINT workspaces_approval_mode_check
    CHECK (approval_mode IN ('manual', 'auto'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.workspaces
    ADD CONSTRAINT workspaces_daily_new_cap_check
    CHECK (daily_new_cap IS NULL OR daily_new_cap BETWEEN 0 AND 500);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.campaign_recipients
  ADD COLUMN IF NOT EXISTS reply_snippet text;

CREATE OR REPLACE FUNCTION public.refill_queue(p_queue_id uuid, p_max_add integer DEFAULT 500)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  q RECORD;
  audience JSONB;
  preferred uuid[];
  inserted INTEGER := 0;
  real_total INTEGER;
  real_pend INTEGER;
  real_sent INTEGER;
BEGIN
  SELECT id, user_id, workspace_id, audience_filter INTO q
  FROM public.send_queues WHERE id = p_queue_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  audience := q.audience_filter;
  IF audience->>'type' NOT IN ('all','tag','deliverable') THEN RETURN 0; END IF;
  preferred := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(audience->'prefer_replied_workspace_ids')::uuid),
    '{}'::uuid[]);

  WITH eligible AS (
    SELECT c.id,
           CASE
             WHEN audience->>'type' <> 'deliverable' THEN public.contact_position_priority(c."position")
             WHEN EXISTS (SELECT 1 FROM public.campaign_recipients cr
                          WHERE cr.contact_id = c.id AND cr.status = 'replied'
                            AND cr.workspace_id = ANY (preferred)) THEN 1000
             WHEN EXISTS (SELECT 1 FROM public.campaign_recipients cr
                          WHERE cr.contact_id = c.id AND cr.status = 'replied') THEN 500
             ELSE public.contact_position_priority(c."position")
           END AS prio
    FROM public.contacts c
    WHERE c.user_id = q.user_id
      AND c.deleted_at IS NULL
      AND c.archived_at IS NULL
      AND c.status = 'active'
      AND (audience->>'type' IN ('all','deliverable')
           OR (audience->>'type' = 'tag' AND c.tags @> ARRAY[audience->>'tag']::text[]))
      -- Hermes-sourced contacts belong to the Hermes workspace's own drafts.
      AND (audience->>'type' = 'tag' OR c.source IS DISTINCT FROM 'hermes')
      AND (audience->>'type' <> 'deliverable' OR (
            EXISTS (SELECT 1 FROM public.campaign_recipients cr
                    WHERE cr.contact_id = c.id
                      AND (cr.status = 'replied'
                           OR (cr.status IN ('sent','opened') AND cr.sent_at <= now() - interval '3 days')))
            AND NOT EXISTS (SELECT 1 FROM public.campaign_recipients cr
                            WHERE cr.contact_id = c.id
                              AND (cr.status = 'bounced'
                                   OR cr.reply_classification IN ('not_interested','unsubscribe_request')))))
      AND NOT EXISTS (
        SELECT 1 FROM public.queue_recipients qr
        WHERE qr.queue_id = p_queue_id AND qr.contact_id = c.id)
    ORDER BY 2 DESC, random()
    LIMIT p_max_add
  ), ins AS (
    INSERT INTO public.queue_recipients
      (queue_id, contact_id, user_id, workspace_id, status, priority, shuffle_key)
    SELECT p_queue_id, e.id, q.user_id, q.workspace_id, 'pending', e.prio,
           (floor(random() * 1000000000))::int
    FROM eligible e
    ON CONFLICT (queue_id, contact_id) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO inserted FROM ins;

  SELECT COUNT(*) FILTER (WHERE TRUE),
         COUNT(*) FILTER (WHERE status = 'pending'),
         COUNT(*) FILTER (WHERE status = 'sent')
    INTO real_total, real_pend, real_sent
  FROM public.queue_recipients WHERE queue_id = p_queue_id;

  UPDATE public.send_queues
     SET total_in_queue = real_total,
         total_pending = real_pend,
         total_sent = real_sent,
         last_refilled_at = CASE WHEN inserted > 0 THEN now() ELSE last_refilled_at END
   WHERE id = p_queue_id;

  RETURN inserted;
END;
$function$;
