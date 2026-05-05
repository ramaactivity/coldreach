# ColdReach

Cold email automation untuk multi-workspace business. Built untuk handle 3 bisnis (Tiska Catering, Tetra Photobooth, Visual Tetra) dengan database kontak shared, schedule otomatis berbeda per workspace, dan AI personalization gratis.

> **Source of truth:** [`docs/14-Final-MVP-Decision.md`](./docs/14-Final-MVP-Decision.md)

## Stack

| Layer | Tool |
|-------|------|
| Frontend + Backend | Next.js 16 (App Router) di Vercel Hobby |
| Database + Auth + Storage + Cron | Supabase Free |
| Email Sending | Gmail API (per workspace) |
| AI Personalization | Google Gemini 2.5 Flash (1500 req/day free) |

Cost target: **Rp 0/bulan**.

## Setup Lokal

### Prereq
- Node.js 20+ (cek: `node --version`)
- npm 10+

### Step-by-step

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Copy environment file**
   ```bash
   cp .env.local.example .env.local
   ```

3. **Isi `.env.local`** dengan kredensial dari:
   - Supabase project → URL + anon key + service role key
   - Google Cloud Console (OAuth): client ID + secret
   - Google AI Studio: Gemini API key
   - Generate `CRON_SECRET` dan `ENCRYPTION_KEY`: `openssl rand -hex 32`

4. **Apply DB migrations** ke Supabase via SQL Editor, dalam urutan:
   - `supabase/migrations/0001_initial_schema.sql` — 17 tables, RLS, triggers
   - `supabase/migrations/0002_storage.sql` — attachment bucket
   - `supabase/migrations/0003_ai_opener.sql` — AI opener cache columns

5. **Run dev server**
   ```bash
   npm run dev
   ```
   Buka http://localhost:3000

## Folder Structure

```
.
├── src/
│   ├── app/
│   │   ├── (app)/            # Protected pages (auth required)
│   │   │   ├── dashboard/    # Cross-workspace dashboard
│   │   │   ├── onboarding/   # First-time + add workspace
│   │   │   └── w/[slug]/     # Per-workspace section
│   │   │       ├── dashboard/, contacts/, templates/, queues/,
│   │   │       │   pipeline/, settings/
│   │   │       └── layout.tsx + sidebar.tsx + workspace-switcher.tsx
│   │   ├── api/
│   │   │   ├── cron/         # Scheduled jobs (queue, reply, followup)
│   │   │   ├── gmail/connect # OAuth flow
│   │   │   └── track/open    # Email open pixel
│   │   ├── auth/             # Login/signout/callbacks
│   │   └── login/
│   ├── components/           # Shared components
│   └── lib/
│       ├── supabase/         # client.ts, server.ts, admin.ts, session.ts
│       ├── ai-opener.ts      # Gemini personalization
│       ├── crypto.ts         # AES-256-GCM for OAuth tokens
│       ├── email-sender.ts   # MIME compose + Gmail API send
│       ├── followup-runner.ts
│       ├── gmail.ts          # OAuth helpers
│       ├── queue-runner.ts   # The "kerja sendiri" core
│       ├── reply-detector.ts
│       ├── stats.ts
│       ├── templates.ts, queues.ts, workspaces.ts, contacts.ts
│       └── *-helpers.ts      # Client-safe types/constants
├── supabase/
│   └── migrations/           # 4 SQL migrations
├── docs/                     # Spec docs (source of truth)
└── proxy.ts                  # Auth gate (Next.js 16 middleware convention)
```

## Roadmap

| Fase | Deliverable | Status |
|------|-------------|--------|
| 0 | Project setup (Next.js scaffold, Supabase + Google OAuth + Gemini accounts, env) | ✓ |
| 1 | Database schema (17 tables) + RLS + Supabase client lib | ✓ |
| 2 | Auth (Google OAuth via Supabase) + login flow + protected layout | ✓ |
| 2.5 | Multi-workspace foundation (table, switcher, /w/[slug] routing) | ✓ |
| 3A | Contact CRUD (list, create, edit, soft-delete) | ✓ |
| 3B | CSV import (papaparse, 3-step wizard, bulk insert with dedup) | ✓ |
| 4 | Templates editor (subject variants, plain body, variable detection, PDF attachment) | ✓ |
| 5 | Connect Gmail per workspace (OAuth + AES-256-GCM token encryption) | ✓ |
| 6 | Send Queue + Email Engine (compose MIME, send via Gmail API, run-now button) | ✓ |
| 7 | AI Opener (Gemini 2.5 Flash with per-contact-per-workspace cache) | ✓ |
| 8 | Tracking (open pixel + Gmail thread poller for replies) | ✓ |
| 9 | Auto Follow-up (threaded replies via In-Reply-To header) | ✓ |
| 10 | Pipeline Kanban view per workspace | ✓ |
| 11 | Dashboard + Notifications (real KPIs, recent replies, activity feed) | ✓ |
| 12 | Polish (sidebar nav, lucide icons, deploy guide) | ✓ |

## Cron Jobs (Production)

Setelah deploy, pasang pg_cron schedules dari [`supabase/migrations/0004_production_cron.sql`](./supabase/migrations/0004_production_cron.sql):

| Job | Schedule | Endpoint |
|-----|----------|----------|
| queue-runner | Every 30 min, Mon-Fri 08-18 WIB | `/api/cron/queue-runner` |
| reply-poller | Every 15 min, 24/7 | `/api/cron/reply-poller` |
| followup-runner | Every hour, Mon-Fri 08-18 WIB | `/api/cron/followup-runner` |
| quota-reset | Daily 00:00 WIB | `public.reset_daily_quotas()` |

All HTTP endpoints require `X-Cron-Secret` header matching `CRON_SECRET` env.

## Deploy

Lihat **[DEPLOY.md](./DEPLOY.md)** untuk panduan deploy ke Vercel + production cron setup.

## License

Private project. All rights reserved.
