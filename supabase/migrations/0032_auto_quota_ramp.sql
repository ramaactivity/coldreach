-- =============================================================================
-- ColdReach — Auto quota ramp
-- daily_quota naik otomatis +10/hari sampai maksimal 500, dijalankan cron
-- /api/cron/quota-ramp tiap hari kerja 23:00 WIB (16:00 UTC) — setelah window
-- kirim tutup (17:00 WIB), sebelum quota reset 00:00 WIB, jadi
-- emails_sent_today masih berisi utilisasi hari itu.
--
-- Naik HANYA kalau semua syarat kepenuhi (lihat src/lib/quota-ramp.ts):
--   - akun aktif + health_status = 'healthy'
--   - warmup sudah selesai (gak lagi dicap di bawah daily_quota)
--   - quota hari itu kepakai >= 80%
--   - bounce rate 7 hari terakhir < 4% (dengan sample >= 50 kiriman)
-- =============================================================================

ALTER TABLE public.email_accounts
  ADD COLUMN IF NOT EXISTS auto_ramp_enabled BOOLEAN NOT NULL DEFAULT true;

-- Cron registration (di-apply live via Management API; template mengikuti
-- pola 0004 — ganti <APP_URL> dan <CRON_SECRET> kalau re-run di project baru):
--
-- SELECT cron.schedule(
--   'coldreach-quota-ramp',
--   '0 16 * * 1-5',   -- 23:00 WIB Mon-Fri
--   $$
--   SELECT net.http_get(
--     url := '<APP_URL>/api/cron/quota-ramp',
--     headers := jsonb_build_object('X-Cron-Secret', '<CRON_SECRET>')
--   );
--   $$
-- );
