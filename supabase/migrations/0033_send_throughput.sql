-- Send-throughput fixes. Accounts were topping out at ~60-95/day against a
-- 100/day quota because every tick was wall-clock bound, not supply bound:
--   * Vercel functions ran in iad1 while Postgres lives in ap-southeast-1
--     (~230ms per round trip), so each send burned ~1.8s and each queue's
--     preamble ~10s.
--   * The cross-workspace dedup check was an unindexed scan over
--     campaign_recipients (nothing covering user_id + email + created_at).
--     Two of those per send.
-- Region + code fixes live outside this file; here we add the indexes those
-- hot queries need and an atomic claim so parallel queue runners can't
-- double-send the same contact.

-- Cross-workspace dedup lookup: "has this user emailed this address inside
-- the dedup window?" — runs once per candidate batch and once per send.
CREATE INDEX IF NOT EXISTS idx_cr_dedup_lookup
  ON public.campaign_recipients (user_id, lower(contact_email), created_at DESC)
  WHERE status IN ('sending', 'sent', 'opened', 'replied');

-- Per-company-domain daily cap: "everything this workspace sent today".
CREATE INDEX IF NOT EXISTS idx_cr_workspace_created
  ON public.campaign_recipients (workspace_id, created_at DESC);

-- Per-queue "sent today" count that drives batch pacing in the cron route.
CREATE INDEX IF NOT EXISTS idx_qr_queue_sent_at
  ON public.queue_recipients (queue_id, sent_at DESC)
  WHERE status = 'sent';

-- Atomic claim: dedup-check + reserve in ONE round trip instead of
-- SELECT-then-INSERT. The advisory lock serializes concurrent claims of the
-- same address, which matters now that all workspace queues run in parallel
-- inside a single cron invocation. Returns the new campaign_recipients id,
-- or NULL when the address was already claimed inside the window.
CREATE OR REPLACE FUNCTION public.claim_contact_send(
  p_user_id uuid,
  p_workspace_id uuid,
  p_contact_id uuid,
  p_contact_email text,
  p_cutoff timestamptz
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(lower(p_contact_email), 0));

  INSERT INTO public.campaign_recipients
    (campaign_id, contact_id, user_id, workspace_id, contact_email, status)
  SELECT NULL, p_contact_id, p_user_id, p_workspace_id, p_contact_email, 'sending'
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.campaign_recipients cr
    WHERE cr.user_id = p_user_id
      AND lower(cr.contact_email) = lower(p_contact_email)
      AND cr.created_at >= p_cutoff
      AND cr.status IN ('sending', 'sent', 'opened', 'replied')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
