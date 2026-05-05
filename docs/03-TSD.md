# 03 — Technical Specification Document (TSD)

Detail teknis stack, arsitektur, integrasi, dan batasan.

## 1. Tech Stack Final

### Frontend
- **Framework:** Next.js 14+ dengan App Router
- **UI:** React 18, Tailwind CSS, shadcn/ui
- **Forms:** React Hook Form + Zod validation
- **Tables:** TanStack Table
- **Editor:** TipTap (untuk template editor)
- **Charts:** Recharts
- **State:** TanStack Query (server state) + Zustand (UI state)
- **Icons:** Lucide React

### Backend
- **API Layer:** Next.js API Routes (App Router) + Server Actions
- **Auth:** Supabase Auth (Google OAuth provider)
- **Database:** Supabase Postgres
- **Storage (jika perlu):** Supabase Storage
- **Background Jobs:** Supabase pg_cron + Edge Functions (Deno runtime)
- **Email Sending:** Gmail API (via OAuth user)

### DevOps
- **Repo:** GitHub (private)
- **Deploy:** Vercel Hobby (free)
- **Env Variables:** Vercel + Supabase secrets
- **Monitoring:** Vercel Analytics (free tier)
- **Error Tracking:** Sentry (free tier 5k events/mo) — optional

### External APIs
- **Gmail API:** untuk kirim email, cek thread, cek bounce
- **Google OAuth:** untuk auth user dan akses Gmail

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User's Browser                       │
│  Next.js App (React) — UI, Forms, Dashboard             │
└──────────────┬──────────────────────────────────────────┘
               │ HTTPS
┌──────────────▼──────────────────────────────────────────┐
│              Vercel (Next.js)                           │
│  ┌────────────────┐  ┌─────────────────┐               │
│  │ Server Actions │  │ API Routes      │               │
│  │ (mutations)    │  │ (tracking, OAuth)│               │
│  └────────────────┘  └─────────────────┘               │
└──────────────┬──────────────────────────────────────────┘
               │
       ┌───────┴────────┐
       │                │
┌──────▼─────┐  ┌───────▼──────────┐
│  Supabase  │  │    Gmail API     │
│  Postgres  │  │  (per user OAuth)│
│  Auth      │  └──────────────────┘
│  Edge Fn   │
│  pg_cron   │
└────────────┘

Background Jobs (di Supabase Edge Functions, di-trigger pg_cron):
- Email sender worker (jalan tiap menit cek queue)
- Reply detection (tiap 15 menit)
- Bounce detection (tiap 15 menit)
- Token refresh (tiap 50 menit)
- Daily stats aggregator (tengah malam)
```

## 3. Authentication Architecture

### 3.1 Flow
1. User klik "Login dengan Google" di Next.js app
2. Frontend call `supabase.auth.signInWithOAuth({ provider: 'google', options: { scopes: 'gmail.send gmail.readonly gmail.modify' } })`
3. Redirect ke Google consent
4. Google redirect ke `https://[domain]/auth/callback?code=...`
5. Next.js handle callback, exchange code for session di Supabase
6. Supabase trigger create user di tabel `users` jika belum ada
7. Redirect ke dashboard

### 3.2 Token Storage
Supabase auth provider Google nyimpan provider_token (Gmail access token) dan provider_refresh_token di session. Tapi ini hilang setelah logout.

Solusi: kita simpan di tabel `email_accounts` sendiri (encrypted via Supabase Vault atau pgsodium). Setiap akun Gmail jadi satu row di sini.

### 3.3 Token Refresh
Edge Function `refresh-tokens` jalan tiap 50 menit:
```
SELECT * FROM email_accounts WHERE expires_at < now() + interval '15 minutes'
```
Untuk tiap row, panggil Google OAuth refresh endpoint, update token + expires_at.

## 4. Email Sending Architecture (Critical)

### 4.1 Why NOT directly from Next.js API Route
Vercel Hobby function timeout 10 detik. Kalau campaign 100 kontak dengan delay 30 detik, butuh 50 menit. Pasti timeout.

### 4.2 Solution: Queue Pattern
1. User klik "Start Campaign" di UI
2. Server Action di Next.js:
   - Validate input
   - Insert ke `campaigns` table
   - Insert N rows ke `campaign_recipients` (status: pending)
   - Insert satu row ke `send_jobs` queue
   - Return ke UI dengan campaign ID
3. UI redirect ke campaign detail page, polling status tiap 5 detik
4. Supabase Edge Function `email-sender-worker` di-trigger pg_cron tiap menit:
   - Pick 1 send_job dari queue dengan status pending
   - Lock row (FOR UPDATE SKIP LOCKED)
   - Loop campaign_recipients status pending:
     - Cek apakah dalam send window (jam 9-17)
     - Cek quota Gmail user hari ini
     - Render template dengan data kontak
     - Inject tracking pixel
     - Kirim via Gmail API
     - Update status sent
     - Sleep 30-90 detik
     - Cek lagi: apakah next iteration masih dalam time budget Edge Function?
       - Edge Function timeout 150 detik
       - Kalau tinggal sedikit, exit dan biarkan run berikutnya lanjutkan
5. Selesai semua, mark send_job sebagai completed

### 4.3 Edge Function Time Budget
- Supabase Edge Function: max 150 detik per invocation, free tier
- Per kontak: 30-90 detik delay + 1-3 detik kirim = ~ 40-95 detik
- Realistis: 1-2 kontak per Edge Function invocation
- pg_cron trigger tiap menit, jadi throughput: ~ 60-120 kontak per jam
- Untuk kebutuhan user (50-100 email per hari), MORE than enough

### 4.4 Gmail API Call Pattern
```typescript
// Pseudo code
const message = createRfc822Message({
  to: contact.email,
  from: senderAccount.email,
  subject: renderedSubject,
  htmlBody: renderedHtmlWithPixel,
  plainBody: renderedPlain,
});

const encoded = Buffer.from(message).toString('base64url');

const response = await fetch(
  `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${senderAccount.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encoded }),
  }
);
```

Kalau response 401: token expired, refresh, retry.
Kalau response 429: rate limit, exponential backoff, max 3x.
Kalau response 4xx/5xx lain: log error, mark recipient failed.

## 5. Tracking Implementation

### 5.1 Open Tracking
- Saat email dirender, inject: `<img src="${BASE_URL}/api/track/open/${recipient_id}.gif" width="1" height="1" alt="" />`
- Endpoint `/api/track/open/[id]` di Next.js:
  - Update `campaign_recipients` set opened_at = now() WHERE id = X AND opened_at IS NULL
  - Return 1x1 transparent GIF
- Cache header: no-cache untuk request, tapi response GIF cached client-side

### 5.2 Click Tracking (Phase 2)
- Setiap link di email diganti dengan: `${BASE_URL}/api/track/click/${recipient_id}?url=${encoded_original}`
- Endpoint redirect ke URL asli sambil log click

### 5.3 Reply Tracking via Gmail API
Edge Function `reply-checker` tiap 15 menit:
```typescript
// Untuk setiap campaign_recipient yang status sent/opened
const thread = await gmail.users.threads.get({ id: threadId });
const messagesFromContact = thread.messages.filter(
  m => m.payload.headers.find(h => h.name === 'From')?.value.includes(contactEmail)
);
if (messagesFromContact.length > 0) {
  // Ada balasan!
  await db.update({ status: 'replied', replied_at: now() });
}
```

### 5.4 Bounce Detection
Sama dengan reply, tapi cek pesan dari `mailer-daemon@googlemail.com` atau header `Auto-Submitted`.

## 6. Database Connection Strategy

### 6.1 RLS (Row Level Security)
SEMUA table pake RLS. Policy: user hanya bisa akses data miliknya.

```sql
CREATE POLICY "Users access own data" ON contacts
  FOR ALL USING (auth.uid() = user_id);
```

### 6.2 Connection Pool
- Free tier Supabase: PgBouncer transaction mode pooling enabled by default
- Maksimal connection: 200 concurrent
- Pakai Supabase JS client di client-side (PostgREST), Service Role di Edge Functions

### 6.3 Service Role vs Anon Key
- Anon Key (frontend): RLS-protected, gak bisa bypass
- Service Role (Edge Function): bypass RLS, untuk operasi background

## 7. Performance Considerations

### 7.1 Database
- Index pada kolom yang sering di-query (lihat schema)
- Pagination wajib untuk list kontak (limit 50 per halaman)
- Counting total pakai estimated count untuk speed

### 7.2 Frontend
- Server Components default, Client Components hanya untuk interactivity
- Dynamic import untuk component berat (editor, chart)
- Image optimization via next/image
- Tailwind purge configured

### 7.3 Caching Strategy
- TanStack Query: stale time 60 detik untuk list, 5 menit untuk detail
- Server-side: Vercel Data Cache otomatis (untuk fetch yang gak dynamic)
- Static page (landing, privacy policy): SSG

## 8. Security

### 8.1 Authentication
- Supabase Auth (Google OAuth)
- Session JWT, httpOnly cookie
- CSRF protection bawaan Next.js Server Actions

### 8.2 Authorization
- Row Level Security di SEMUA table
- Server Actions selalu cek `auth.user()` dulu
- Edge Functions verifikasi JWT atau pakai service role secara hati-hati

### 8.3 Token Management
- Gmail tokens encrypted at rest (Supabase Vault atau pgsodium)
- Refresh token stored, access token re-derive
- Pernah expose? Trigger force re-auth

### 8.4 Input Sanitization
- Email body: HTML sanitizer (DOMPurify) sebelum render
- File upload: validate MIME type, ukuran, ekstensi
- SQL injection: pakai parameterized query (Supabase JS aman by default)
- XSS: React auto-escape, kecuali `dangerouslySetInnerHTML` (jangan dipake)

### 8.5 Rate Limiting
- Server Actions: implementasi simple via Supabase function counter (cth: max 10 import per hari)
- API tracking endpoint: rate limit by IP via Vercel middleware
- Kirim email: hard cap di backend (gak bisa di-bypass dari frontend)

## 9. Free Tier Constraints & Mitigations

### 9.1 Supabase Free
| Limit | Value | Mitigation |
|-------|-------|-----------|
| DB storage | 500 MB | Tighter schema, archive old campaign data after 90 days |
| Egress | 5 GB/month | Pagination, gak SELECT * |
| Edge Functions | 500K invocations/mo | Worker tiap menit = 43,200/mo. Aman. |
| Auto-pause | After 7 days idle | Cron-job.org ping app weekly (free) |

### 9.2 Vercel Hobby
| Limit | Value | Mitigation |
|-------|-------|-----------|
| Function timeout | 10s | Pindah heavy work ke Edge Function |
| Bandwidth | 100 GB/mo | Optimize images, minimal client JS |
| Build time | 6000 min/mo | Reduce build time, lazy install |
| Function invocations | 100k/mo | Caching agresif |

### 9.3 Gmail (Free Account)
| Limit | Value | Mitigation |
|-------|-------|-----------|
| Daily send | 500/day total | App default 30/day per account |
| Recipients per email | 100 | Always 1:1, gak BCC |
| Rate limit API | varies | Exponential backoff |

## 10. Folder Structure

```
cold-reach/
├── app/                          # Next.js App Router
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── auth/callback/route.ts
│   ├── (app)/                    # Authenticated routes
│   │   ├── layout.tsx            # Sidebar layout
│   │   ├── dashboard/page.tsx
│   │   ├── contacts/
│   │   │   ├── page.tsx
│   │   │   └── import/page.tsx
│   │   ├── templates/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── campaigns/
│   │   │   ├── page.tsx
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/page.tsx
│   │   └── settings/
│   │       └── page.tsx
│   ├── api/
│   │   ├── track/
│   │   │   ├── open/[id]/route.ts
│   │   │   └── click/[id]/route.ts
│   │   └── unsubscribe/[token]/route.ts
│   ├── unsubscribe/[token]/page.tsx  # Public unsubscribe page
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/                       # shadcn components
│   ├── contacts/
│   ├── templates/
│   ├── campaigns/
│   └── shared/
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # Client-side client
│   │   ├── server.ts             # Server-side client
│   │   └── service.ts            # Service role client (server only)
│   ├── gmail/
│   │   ├── send.ts
│   │   ├── threads.ts
│   │   └── oauth.ts
│   ├── templates/
│   │   └── render.ts             # Variable substitution
│   └── utils/
├── supabase/
│   ├── migrations/               # SQL migrations
│   └── functions/                # Edge Functions
│       ├── email-sender-worker/
│       ├── reply-checker/
│       ├── bounce-checker/
│       └── refresh-tokens/
├── types/
│   └── database.ts               # Generated from Supabase
├── public/
├── .env.local                    # NOT committed
├── .env.example
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

## 11. Environment Variables

```bash
# .env.example
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=  # Server only

# Google OAuth (configure in Supabase Auth provider, but also need direct for Gmail API)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# App
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app

# Optional
SENTRY_DSN=
```

## 12. Migration Path: Free → Paid

Kalau suatu hari user butuh upgrade:
- 500MB Supabase habis → upgrade Pro $25/mo
- Need custom domain email (bukan @gmail.com) → user beli domain + Workspace ($6/mo)
- Need > 200 email/hari per akun → tambah Gmail accounts atau upgrade ke Workspace
- Need lebih banyak Edge Function invocations → Pro

Aplikasi tetap codebase yang sama. Cuma flip tier-nya aja.
