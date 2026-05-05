# Deploy ColdReach ke Production

Panduan deploy dari local dev ke Vercel + Supabase production. Estimasi 30-45 menit.

## Prerequisites

- Local dev udah berfungsi (login, kirim email tes, dll)
- GitHub account
- Akses Vercel + Supabase dashboard yang sama dengan local

## Step 1: Push ke GitHub

```bash
# Buat repo baru di github.com/new (private, sesuai keinginan)
# Lalu di terminal:

git remote add origin git@github.com:<username>/coldreach.git
git branch -M main
git push -u origin main
```

## Step 2: Deploy ke Vercel

1. Buka https://vercel.com/new
2. Import GitHub repo `coldreach`
3. Framework preset: **Next.js** (auto-detect)
4. Pakai default build/output settings
5. Klik **"Environment Variables"** dan add semua dari `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   GOOGLE_CLIENT_ID
   GOOGLE_CLIENT_SECRET
   GEMINI_API_KEY
   CRON_SECRET
   ENCRYPTION_KEY
   ```
   ⚠️ **Update `NEXT_PUBLIC_APP_URL`** ke domain Vercel lu (akan di-assign setelah deploy).
   Format: `https://coldreach-xxx.vercel.app` atau custom domain.
6. Klik **"Deploy"**. Tunggu ~2-3 menit.

## Step 3: Update Google OAuth Redirect URIs

Dashboard URL: https://console.cloud.google.com/auth/clients

Add dua URI baru ke OAuth Client lu:
- `https://<your-vercel-domain>/auth/callback`
- `https://<your-vercel-domain>/auth/gmail-connect/callback`

Pertahankan URI localhost yang lama untuk dev. Klik **Save**.

## Step 4: Update Supabase Auth Redirect URL

Dashboard: https://supabase.com/dashboard/project/_/auth/url-configuration

Update **Site URL** ke `https://<your-vercel-domain>`.
Tambah ke **Redirect URLs**:
- `https://<your-vercel-domain>/auth/callback`
- `https://<your-vercel-domain>/auth/gmail-connect/callback`

## Step 5: Run Production Cron Migration

Buka SQL Editor di Supabase dashboard. Buka [`supabase/migrations/0004_production_cron.sql`](./supabase/migrations/0004_production_cron.sql).

**Sebelum paste**, replace 2 placeholder:
- `<APP_URL>` → `https://your-vercel-domain.vercel.app`
- `<CRON_SECRET>` → value `CRON_SECRET` dari `.env.local` lu

Run. Cek dengan:
```sql
SELECT jobid, jobname, schedule FROM cron.job;
```
Harus liat 4 jobs: queue-runner, reply-poller, followup-runner, quota-reset.

## Step 6: Verify

1. Buka `https://<your-vercel-domain>` → redirect ke /login
2. Login dengan Google
3. Connect Gmail di workspace settings
4. Bikin queue, kirim 1 email tes
5. Tunggu ~30 menit, verify queue otomatis kirim batch berikutnya
6. Cek cron logs:
   ```sql
   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
   ```

## Production Maintenance

### Daily checks
- Vercel dashboard → Functions tab → cek error rate
- Supabase dashboard → Logs tab → cek API errors

### Cek cron health
```sql
-- Last 24 hours of cron runs
SELECT jobname, status, start_time, end_time
FROM cron.job_run_details
WHERE start_time > NOW() - INTERVAL '24 hours'
ORDER BY start_time DESC;
```

### Recovery dari quota habis
Kalau email_account hit Gmail rate limit, status auto jadi `blocked`. Check di Settings, disconnect + reconnect kalau perlu.

### Backup
Source code: push ke GitHub regular.
DB: Supabase free tier auto-backup harian (7 hari retention).
Schema: di `supabase/migrations/*.sql`, bagian dari git.

## Going Past MVP

Hal-hal yang gak include di MVP tapi bisa ditambah:
- Custom domain (Vercel → Settings → Domains)
- App verification di Google (untuk hapus "App not verified" warning) — butuh privacy policy + ToS public
- Workspace settings UI (edit pipeline stages, schedule defaults via UI)
- Auto follow-up config UI (sekarang manual via DB)
- Click tracking, A/B testing, multi-step follow-up
- Mobile app native

Lihat juga `docs/14-Final-MVP-Decision.md` section "What's NOT in MVP" untuk reference.
