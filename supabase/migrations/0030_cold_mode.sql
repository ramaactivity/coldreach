-- Cold mode: send cold outreach as a plain-text, personal-looking email
-- (no open pixel, no click-link rewriting, no HTML/logo signature). Tracked
-- HTML emails get classified into Gmail's Promotions tab or spam for cold
-- first-touch; a plain text/plain message reads like a 1:1 email and lands in
-- Primary. Reply + bounce detection still work (they don't need the pixel).
--
-- Default TRUE so every existing and new queue immediately benefits. Flip to
-- false per-queue for warm/branded sends that want the rich HTML + tracking.
ALTER TABLE public.send_queues
  ADD COLUMN IF NOT EXISTS cold_mode BOOLEAN NOT NULL DEFAULT true;
