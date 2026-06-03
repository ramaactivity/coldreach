-- =============================================================================
-- ColdReach — Multi-template per queue (body randomizer + A/B effectiveness)
-- File: 0025_queue_multi_template.sql
-- Created: 2026-06-03
--
-- A queue used to bind to a single send_queues.template_id. Now a queue can
-- rotate across SEVERAL templates (balanced-random per send) so the message
-- varies AND we can see which body performs best. To attribute opens/replies
-- to the template actually used, each send records its template on
-- queue_recipients.template_id.
--
-- Back-compat: template_id stays as the primary/fallback. Old queues with
-- template_ids = NULL behave as [template_id]; old sends with
-- queue_recipients.template_id = NULL fall back to the queue's template in
-- the stats RPCs via COALESCE.
-- =============================================================================

-- 1. Rotation pool on the queue.
ALTER TABLE public.send_queues
  ADD COLUMN IF NOT EXISTS template_ids UUID[];

COMMENT ON COLUMN public.send_queues.template_ids IS
  'Pool of templates this queue rotates across (balanced-random per send). NULL/empty => use template_id only.';

-- Backfill existing queues so the pool always reflects the single template.
UPDATE public.send_queues
  SET template_ids = ARRAY[template_id]
  WHERE template_ids IS NULL AND template_id IS NOT NULL;

-- 2. Which template each send actually used (set when status flips to 'sent').
ALTER TABLE public.queue_recipients
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.templates(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.queue_recipients.template_id IS
  'Template used for this send (chosen by the balanced rotation). NULL for legacy rows / not yet sent.';

CREATE INDEX IF NOT EXISTS idx_queue_recipients_queue_template
  ON public.queue_recipients (queue_id, template_id);

-- 3. Workspace-wide per-template stats — now attributed to the template
--    actually used per send, falling back to the queue template for old rows.
CREATE OR REPLACE FUNCTION public.get_template_stats_for_workspace(ws_id UUID)
RETURNS TABLE (
  template_id   UUID,
  sent_count    INT,
  opened_count  INT,
  replied_count INT,
  last_used_at  TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(qr.template_id, q.template_id) AS template_id,
    COUNT(cr.id) FILTER (WHERE cr.sent_at IS NOT NULL)::int    AS sent_count,
    COUNT(cr.id) FILTER (WHERE cr.opened_at IS NOT NULL)::int  AS opened_count,
    COUNT(cr.id) FILTER (WHERE cr.replied_at IS NOT NULL)::int AS replied_count,
    MAX(cr.sent_at) AS last_used_at
  FROM public.send_queues q
  JOIN public.queue_recipients qr ON qr.queue_id = q.id
  LEFT JOIN public.campaign_recipients cr ON cr.id = qr.campaign_recipient_id
  WHERE q.workspace_id = ws_id
    AND COALESCE(qr.template_id, q.template_id) IS NOT NULL
  GROUP BY COALESCE(qr.template_id, q.template_id);
$$;

-- 4. Per-queue breakdown for the A/B comparison card on the queue page.
CREATE OR REPLACE FUNCTION public.get_queue_template_breakdown(p_queue_id UUID)
RETURNS TABLE (
  template_id   UUID,
  sent          INT,
  opened        INT,
  replied       INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(qr.template_id, q.template_id) AS template_id,
    COUNT(qr.id) FILTER (WHERE qr.status = 'sent')::int        AS sent,
    COUNT(cr.id) FILTER (WHERE cr.opened_at IS NOT NULL)::int  AS opened,
    COUNT(cr.id) FILTER (WHERE cr.replied_at IS NOT NULL)::int AS replied
  FROM public.send_queues q
  JOIN public.queue_recipients qr ON qr.queue_id = q.id
  LEFT JOIN public.campaign_recipients cr ON cr.id = qr.campaign_recipient_id
  WHERE q.id = p_queue_id
    AND COALESCE(qr.template_id, q.template_id) IS NOT NULL
  GROUP BY COALESCE(qr.template_id, q.template_id);
$$;

-- 5. Sent-count per template for one queue — used by the runner to pick the
--    least-used template (balanced rotation).
CREATE OR REPLACE FUNCTION public.queue_template_send_counts(p_queue_id UUID)
RETURNS TABLE (
  template_id UUID,
  cnt         INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT qr.template_id, COUNT(*)::int AS cnt
  FROM public.queue_recipients qr
  WHERE qr.queue_id = p_queue_id
    AND qr.status = 'sent'
    AND qr.template_id IS NOT NULL
  GROUP BY qr.template_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_template_stats_for_workspace(UUID)
  TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.get_queue_template_breakdown(UUID)
  TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_template_send_counts(UUID)
  TO service_role, authenticated;
