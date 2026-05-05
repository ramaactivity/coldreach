# ColdReach

Cold email automation untuk multi-workspace business. Built untuk handle 3 bisnis (Tiska Catering, Tetra Photobooth, Visual Tetra) dengan database kontak shared, schedule otomatis berbeda per workspace, dan AI personalization gratis.

> **Source of truth:** [`docs/14-Final-MVP-Decision.md`](./docs/14-Final-MVP-Decision.md)

## Stack

| Layer | Tool |
|-------|------|
| Frontend + Backend | Next.js 16 (App Router) di Vercel Hobby |
| Database + Auth + Storage + Cron | Supabase Free |
| Email Sending | Gmail API (per workspace) |
| AI Personalization | Google Gemini Free (1500 req/day) |

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
   - Supabase project: https://supabase.com/dashboard
   - Google Cloud Console (OAuth): https://console.cloud.google.com/apis/credentials
   - Google AI Studio (Gemini): https://aistudio.google.com/apikey

4. **Run dev server**
   ```bash
   npm run dev
   ```
   Buka http://localhost:3000

## Folder Structure

```
.
├── src/
│   ├── app/                # Next.js App Router pages
│   ├── components/         # React components
│   └── lib/
│       ├── supabase/       # Supabase clients (server + browser)
│       └── utils.ts        # cn() utility
├── supabase/
│   ├── migrations/         # SQL migration files (Fase 1+)
│   └── functions/          # Edge Functions (queue runner, dll, Fase 6+)
├── docs/                   # Spec & design docs (source of truth)
└── public/                 # Static assets
```

## Roadmap

Lihat [`docs/14-Final-MVP-Decision.md`](./docs/14-Final-MVP-Decision.md) untuk roadmap lengkap.

| Fase | Status |
|------|--------|
| 0. Project setup | ✓ |
| 1. Database schema + RLS | pending |
| 2. Auth (Google OAuth) | pending |
| 2.5. Multi-workspace foundation | pending |
| 3. Contact CRUD + Import CSV | pending |
| 4. Templates editor + PDF attachment | pending |
| 5. Connect Gmail per workspace | pending |
| 6. Send Queue + Schedule + Email Engine | pending |
| 7. AI Opener (Gemini) | pending |
| 8. Tracking (open + reply) | pending |
| 9. Auto Follow-up | pending |
| 10. Pipeline Kanban | pending |
| 11. Dashboard + Notifications | pending |
| 12. Polish + Production deploy | pending |

## Deploy

Production di Vercel — auto-deploy dari `main` branch.

## License

Private project. All rights reserved.
