-- Human-vs-machine open/click tracking.
--
-- The tracking pixel fires on every fetch, but in cold outreach to corporate
-- inboxes the vast majority of fetches are machines: mail-security scanners
-- (Microsoft Defender/ATP, Proofpoint, Mimecast…), Apple Mail Privacy
-- Protection, and Gmail/Yahoo image proxies. A production histogram of
-- (opened_at - sent_at) showed ~87% of opens landing in a 5-60s spike right
-- after send, then collapsing off a cliff — the genuine human tail only starts
-- after ~60s.
--
-- We keep raw open_count/click_count as-is (forensic) and add filtered
-- "human_*" columns that only move on real human engagement. App code
-- (src/lib/open-classifier.ts) writes these going forward; the backfill below
-- reconstructs them for existing rows using the same 60s boundary.

ALTER TABLE public.campaign_recipients
  ADD COLUMN IF NOT EXISTS human_open_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.campaign_recipients
  ADD COLUMN IF NOT EXISTS human_opened_at TIMESTAMPTZ;
ALTER TABLE public.campaign_recipients
  ADD COLUMN IF NOT EXISTS last_open_at TIMESTAMPTZ;
ALTER TABLE public.campaign_recipients
  ADD COLUMN IF NOT EXISTS human_click_count INTEGER NOT NULL DEFAULT 0;

-- Drives the dashboard open-rate query (counts human opens in a window).
CREATE INDEX IF NOT EXISTS idx_recipients_human_opened
  ON public.campaign_recipients(workspace_id, human_opened_at)
  WHERE human_opened_at IS NOT NULL;

-- Backfill 1: treat a historical first-open as human only if it arrived at
-- least 60s after send. We only stored the first open timestamp, so this is a
-- floor (a machine scan followed by a later real open can't be recovered), but
-- it makes historical open rates honest instead of 5-10x inflated.
UPDATE public.campaign_recipients
SET human_opened_at = opened_at,
    human_open_count = GREATEST(open_count, 1),
    last_open_at = opened_at
WHERE opened_at IS NOT NULL
  AND sent_at IS NOT NULL
  AND opened_at - sent_at >= interval '60 seconds';

-- Backfill 2: preserve a best-effort last_open_at for the machine-only rows too.
UPDATE public.campaign_recipients
SET last_open_at = opened_at
WHERE opened_at IS NOT NULL
  AND last_open_at IS NULL;

-- Backfill 3: any row whose ONLY open was a machine scan was wrongly promoted
-- to status='opened'. Revert those to 'sent' so the pipeline/inbox reflect real
-- reads. Rows with a genuine human open (human_opened_at set above) keep
-- 'opened'; 'replied'/'bounced'/etc. are untouched.
UPDATE public.campaign_recipients
SET status = 'sent'
WHERE status = 'opened'
  AND human_opened_at IS NULL
  AND sent_at IS NOT NULL;
