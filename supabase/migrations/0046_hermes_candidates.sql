-- =============================================================================
-- ColdReach — Hermes request #3: candidate contacts for Bruno
-- File: 0046_hermes_candidates.sql
--
-- hermes_candidates() hands Bruno corporate contacts Cold Reach already has
-- (≈24k active) that NO Tetra workspace has ever emailed, and reserves them
-- for p_reserve_days so two runs never get the same person.
--
-- Eligible: active, not archived/deleted, company domain (not webmail), never
-- emailed by p_workspace_ids, never bounced anywhere, not emailed by anyone in
-- the last 45 days (cross-workspace cooldown), not queued anywhere, and not
-- reserved. Per domain: skip if another contact there is reserved or a Tetra
-- workspace emailed that domain in the last 30 days; at most ONE person per
-- domain per call, best role first.
-- Role from position: ga (GA / umum / office / facility / procurement /
-- purchasing) → marketing (marketing / event / brand / communication / PR /
-- social media) → hr (HR / human capital / people / talent / recruitment) →
-- lain.
--
-- refill_queue: contacts under a Hermes reservation are not pulled into other
-- workspaces' evergreen queues (otherwise Bruno's draft would be rejected as
-- "already queued elsewhere").
-- =============================================================================

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS hermes_reserved_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_contacts_hermes_reserved
  ON public.contacts (hermes_reserved_until)
  WHERE hermes_reserved_until IS NOT NULL;

CREATE OR REPLACE FUNCTION public.contact_role(p_position text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_position ~* '(general affair|\mga\M|\mumum\M|office manager|facilit|procure|purchas|pengadaan)' THEN 'ga'
    WHEN p_position ~* '(marketing|\mevent|\mbrand|communication|corcomm|public relation|\mpr\M|social media|promo|humas)' THEN 'marketing'
    WHEN p_position ~* '(\mhr|human|people|talent|recruit|personalia|employee|\msdm\M)' THEN 'hr'
    ELSE 'lain'
  END;
$$;

CREATE OR REPLACE FUNCTION public.hermes_candidates(
  p_user_id uuid,
  p_workspace_ids uuid[],      -- the Tetra workspaces: never emailed by any of these
  p_webmail text[],            -- consumer webmail domains to skip
  p_limit integer,
  p_roles text[] DEFAULT NULL, -- subset of ga / marketing / hr; NULL = any (lain last)
  p_reserve_days integer DEFAULT 14
)
RETURNS TABLE (
  id uuid, email text, first_name text, last_name text, "position" text,
  company text, phone text, domain text, role text, reserved_until timestamptz
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH base AS (
    SELECT c.id, split_part(lower(c.email), '@', 2) AS dom, public.contact_role(c."position") AS role
    FROM public.contacts c
    WHERE c.user_id = p_user_id
      AND c.deleted_at IS NULL AND c.archived_at IS NULL AND c.status = 'active'
      AND (c.hermes_reserved_until IS NULL OR c.hermes_reserved_until < now())
  ), busy_domains AS (
    SELECT split_part(lower(c.email), '@', 2) AS dom
    FROM public.contacts c
    WHERE c.user_id = p_user_id AND c.hermes_reserved_until > now()
    UNION
    SELECT split_part(lower(cr.contact_email), '@', 2)
    FROM public.campaign_recipients cr
    WHERE cr.user_id = p_user_id
      AND cr.workspace_id = ANY (p_workspace_ids)
      AND cr.created_at > now() - interval '30 days'
  ), eligible AS (
    SELECT b.*
    FROM base b
    WHERE b.dom <> '' AND NOT (b.dom = ANY (p_webmail))
      AND b.dom NOT IN (SELECT dom FROM busy_domains)
      AND (p_roles IS NULL OR b.role = ANY (p_roles))
      AND NOT EXISTS (
        SELECT 1 FROM public.campaign_recipients cr
        WHERE cr.contact_id = b.id
          AND (cr.workspace_id = ANY (p_workspace_ids)
               OR cr.status = 'bounced'
               OR cr.created_at > now() - interval '45 days'))
      AND NOT EXISTS (
        SELECT 1 FROM public.queue_recipients qr
        WHERE qr.contact_id = b.id AND qr.status IN ('pending', 'awaiting_approval'))
  ), one_per_domain AS (
    SELECT DISTINCT ON (dom) *
    FROM eligible
    ORDER BY dom, array_position(ARRAY['ga', 'marketing', 'hr', 'lain'], role), random()
  ), pick AS (
    SELECT * FROM one_per_domain
    ORDER BY array_position(ARRAY['ga', 'marketing', 'hr', 'lain'], role), random()
    LIMIT p_limit
  )
  UPDATE public.contacts t
     SET hermes_reserved_until = now() + make_interval(days => p_reserve_days)
    FROM pick
   WHERE t.id = pick.id
  RETURNING t.id, t.email, t.first_name, t.last_name, t."position", t.company, t.phone,
            pick.dom, pick.role, t.hermes_reserved_until;
$$;

REVOKE ALL ON FUNCTION public.hermes_candidates(uuid, uuid[], text[], integer, text[], integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hermes_candidates(uuid, uuid[], text[], integer, text[], integer) TO service_role;

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
      -- Reserved for Hermes by hermes_candidates (0046): leave them to Bruno.
      AND (c.hermes_reserved_until IS NULL OR c.hermes_reserved_until < now())
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
