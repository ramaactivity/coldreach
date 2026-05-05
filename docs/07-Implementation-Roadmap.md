# 07 — Implementation Roadmap

Urutan eksekusi build, dirancang untuk vibe coding di Antigravity dengan Claude. Tiap fase punya milestone yang bisa di-test.

## How to Use This with Claude in Antigravity

Untuk tiap fase:
1. Buka project di Antigravity
2. Attach folder `docs/` ke context (semua file)
3. Prompt Claude dengan: `"Baca docs/00-README.md dulu sebagai overview. Lalu mulai eksekusi Fase X dari docs/07-Implementation-Roadmap.md. Tampilkan rencana step-by-step sebelum mulai coding."`
4. Setelah Claude bikin plan, approve atau adjust
5. Biarkan Claude execute, review hasilnya
6. Test manual sebelum lanjut fase berikutnya

## Phase 0: Project Setup (Day 1, ~ 2-4 jam)

### Goal
Project siap dikembangkan, semua tools terhubung.

### Tasks
1. Bikin akun di:
   - GitHub
   - Vercel (login dengan GitHub)
   - Supabase
   - Google Cloud Console (untuk Gmail OAuth)
2. Buat Supabase project baru
3. Buat Google Cloud project, enable Gmail API
4. Buat OAuth credentials (Web Application)
5. Configure OAuth consent screen
6. Add scopes: openid, email, profile, gmail.send, gmail.readonly, gmail.modify
7. Test mode dulu (max 100 user, OK buat dev)
8. Inisialisasi Next.js project:
   ```
   npx create-next-app@latest cold-reach --typescript --tailwind --app --src-dir=false
   cd cold-reach
   ```
9. Install dependencies:
   ```
   npm install @supabase/supabase-js @supabase/ssr
   npm install @tanstack/react-query @tanstack/react-table
   npm install react-hook-form @hookform/resolvers zod
   npm install zustand
   npm install date-fns
   npm install lucide-react
   npm install sonner
   npm install dompurify
   npx shadcn@latest init
   ```
10. Configure shadcn (pilih style, warna, dll dari design system)
11. Setup `.env.local` dengan keys
12. Push to GitHub, connect Vercel auto-deploy
13. Setup Supabase CLI lokal:
    ```
    npm install -g supabase
    supabase init
    supabase link --project-ref [your-ref]
    ```

### Deliverable
- Repo GitHub aktif, deploy ke Vercel works (default Next.js page)
- Supabase project online
- Gmail OAuth credentials siap

### Test
- Buka Vercel URL → lihat Next.js default page
- Buka Supabase dashboard → project active
- OAuth credentials valid

## Phase 1: Database Foundation (Day 1-2, ~ 3-4 jam)

### Goal
Database schema lengkap, RLS policies, triggers, seed data.

### Tasks
1. Bikin migration file pertama:
   ```
   supabase migration new initial_schema
   ```
2. Copy SQL dari `04-Database-Schema.md`, paste ke migration file
3. Apply ke remote:
   ```
   supabase db push
   ```
4. Verifikasi di Supabase dashboard semua table ada
5. Setup pg_cron extension via Supabase SQL editor
6. Bikin migration kedua untuk seed data (5-10 starter templates)
7. Generate TypeScript types:
   ```
   supabase gen types typescript --project-id [your-ref] > types/database.ts
   ```
8. Bikin `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/service.ts`

### Deliverable
- Semua 13 table dibuat
- RLS active di semua relevant table
- Triggers updated_at jalan
- Starter templates ter-seed
- TypeScript types ter-generate

### Test
- Insert dummy contact via SQL editor → kena RLS, harus pakai user context
- Update test row → updated_at auto-update
- Run `select * from public.templates where is_starter = true` → return 5+ rows

## Phase 2: Authentication (Day 2, ~ 2-3 jam)

### Goal
User bisa login dengan Google, sesi persist, redirect protected.

### Tasks
1. Bikin `app/(auth)/login/page.tsx` — landing dengan tombol Google
2. Bikin `app/(auth)/auth/callback/route.ts` — handle OAuth callback
3. Bikin middleware `middleware.ts` — check auth, redirect login kalau gak auth di protected route
4. Bikin layout `app/(app)/layout.tsx` — sidebar layout dengan user info
5. Bikin user menu dropdown dengan logout
6. Configure Supabase Auth provider Google di dashboard:
   - Add OAuth credentials dari Google Cloud
   - Add redirect URL: `https://[your-domain]/auth/callback`
   - Add scopes: `openid email profile https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify`
7. Test login flow end-to-end

### Deliverable
- Login dengan Google works
- User row otomatis dibuat di public.users via trigger
- Logout works
- Protected routes redirect ke login kalau belum auth

### Test
- Click login → Google consent → redirect dashboard
- Refresh page → tetap login
- Logout → redirect login
- Akses /dashboard tanpa login → redirect ke /login

## Phase 2.5: Multi-Workspace Foundation ⭐ CRITICAL (Day 3, ~ 4-5 jam)

### Goal
Setup multi-workspace architecture sebagai foundation. Ini WAJIB sebelum lanjut ke fitur lain karena banyak tabel depend ke workspace_id.

### Tasks
1. Migration: create `workspaces` table per docs/12
2. Migration: alter tabel terkait untuk add `workspace_id` column:
   - `email_accounts` (add workspace_id, unique constraint)
   - `templates` (add workspace_id NOT NULL untuk row baru)
   - `campaigns` (add workspace_id NOT NULL untuk row baru)
   - `tags` (add workspace_id, is_global)
   - `saved_filters` (add workspace_id)
3. Migration: create `contact_workspace_data` table dengan trigger
4. Update RLS policies untuk include workspace check
5. Bikin Server Actions untuk workspace CRUD:
   - `listWorkspaces()`
   - `createWorkspace(data)`
   - `updateWorkspace(id, data)`
   - `archiveWorkspace(id)`
   - `setActiveWorkspace(id)` (update user preferences)
6. URL routing setup:
   - Middleware: extract workspace slug dari URL
   - Default redirect logic ke last active workspace
   - Layout `/w/[slug]/layout.tsx` dengan workspace context provider
7. Workspace context React provider (`contexts/workspace-context.tsx`)
8. Workspace switcher component di sidebar
9. Workspace creation wizard:
   - Step 1: Basic info (name, slug, type, color)
   - Step 2: Pipeline preset selection
   - Step 3: Skip atau langsung connect Gmail
10. Update onboarding flow untuk multi-workspace creation di Step 2

### Deliverable
- User bisa create, edit, archive workspace
- Workspace switcher works (instant context switch)
- URL routing /w/[slug]/* works
- Workspace context propagated ke seluruh app
- Default 1 workspace di-create otomatis saat first signup

### Test
- Create 3 workspace (Tiska, Photobooth, Visual)
- Switch antara workspace via sidebar dropdown
- URL berubah sesuai workspace aktif
- Reload page tetap di workspace yang sama
- Create workspace dengan slug duplicate → error
- Archive workspace → hilang dari sidebar tapi data preserved

⚠️ **PENTING:** Setelah Phase 2.5 selesai, semua phase berikutnya (3, 4, 5, 6, 7, dst) HARUS implement workspace context. Tabel templates, campaigns, dst SEMUA scoped ke workspace_id.

## Phase 3: Contact Management (Day 4-6, ~ 8-10 jam)

### Goal
CRUD kontak full functional, import CSV, filter, tag system.

### Sub-phases

### 3.1 Contact List View (3 jam)
- Page `app/(app)/(workspace)/w/[slug]/contacts/page.tsx`
- Server Action `listContacts` dengan pagination, filter, search
- **Workspace context awareness**: tampilkan kolom "Stage di [workspace]" dan "Last Email di [workspace]"
- **Toggle "Show all workspace activity"** untuk lihat data lintas workspace
- Table component dengan TanStack Table
- Empty state component
- Loading skeleton
- Bulk select checkbox
- Action bar muncul saat ada selection

### 3.1.5 Contact Detail Page (1.5 jam)
- Page `app/(app)/contacts/[id]/page.tsx` (NOT workspace-scoped)
- Cross-workspace view: show data dari semua workspace
- Per-workspace section dengan pipeline stage, history, notes
- Action button per workspace: "Send Email from [workspace]"

#### 3.2 Contact CRUD (2 jam)
- Form schema dengan Zod
- Modal "Tambah Kontak"
- Modal "Edit Kontak"
- Server Actions: createContact, updateContact, deleteContacts
- Optimistic UI dengan TanStack Query

#### 3.3 Tag System (1 jam)
- Page settings/tags atau modal
- CRUD tags
- Tag selector di kontak
- Tag chip display

#### 3.4 Custom Fields (1 jam)
- Page settings/custom-fields
- CRUD definisi
- Dynamic form rendering di create/edit kontak

#### 3.5 CSV Import Wizard (3 jam) — yang paling kompleks
- Page `app/(app)/contacts/import/page.tsx`
- Stepper UI:
  - Step 1: Upload file (papaparse / xlsx untuk parse)
  - Step 2: Column mapping UI
  - Step 3: Options (skip duplicate, etc)
  - Step 4: Preview + confirm
- Server Action `importContacts` dengan batch insert
- Progress indicator

### Deliverable
- User bisa add/edit/delete/list kontak
- User bisa import CSV ratusan kontak
- User bisa tag dan filter
- Custom fields jalan

### Test
- Import CSV 100 kontak → semua masuk
- Filter by tag → result tepat
- Search by nama → result tepat
- Edit kontak → tersimpan
- Delete bulk → terhapus
- Custom field saved & rendered

## Phase 4: Email Templates (Day 6-7, ~ 6-8 jam)

### Goal
User bisa bikin template email dengan rich editor, variable, dan attachment.

### Tasks
1. Install TipTap:
   ```
   npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-link
   ```
2. Komponen `RichTextEditor` dengan toolbar
3. Variable picker (dropdown insert `{{variable}}` ke editor)
4. **Attachment upload component** (drag-drop, max 5MB per file, max 3 files)
5. **Attachment storage di Supabase Storage bucket `template-attachments`**
6. Page `app/(app)/templates/page.tsx` — list templates
7. Page `app/(app)/templates/[id]/page.tsx` — edit template
8. Page `app/(app)/templates/new/page.tsx` — create
9. Server Actions: list, get, create, update, delete, duplicate
10. Preview mode dengan dummy contact data (with attachment indicator)
11. Variable detection (auto extract dari body)
12. Library starter templates Tiska-specific (lihat docs/11)
13. **Migration: import Gmail drafts as templates** (untuk founding user)

### Deliverable
- User bisa bikin, edit, hapus template
- Editor support bold, italic, link, list
- **Template support PDF/image attachment**
- Variable insertion mudah
- Preview menunjukkan rendered email
- Starter templates accessible
- **Bisa import dari Gmail drafts existing**

### Test
- Bikin template baru → tersimpan
- Upload PDF attachment → tersimpan di storage
- Edit template → update
- Insert {{first_name}} → di preview tampil nama dummy
- Duplicate starter template → muncul sebagai template user
- Import dari Gmail drafts → 5+ template user ter-create

## Phase 5: Gmail Integration & Email Account Profiles (Day 8-9, ~ 5-7 jam)

### Goal
User bisa connect 1-3 akun Gmail untuk sending dengan business profile masing-masing. Token di-encrypt simpan.

### Tasks
1. Setup pgsodium / Supabase Vault untuk token encryption
2. OAuth flow untuk add Gmail account (terpisah dari login):
   - Page `app/(app)/settings/page.tsx` dengan tab "Connected Accounts"
   - Button "Connect Gmail Account" → trigger OAuth flow
   - Callback handler simpan token ke `email_accounts` table
3. **Business profile setup wizard untuk tiap akun:**
   - "Akun ini untuk bisnis apa?" (e.g. "Tiska Catering")
   - "Default attachment?" (e.g. company profile PDF)
   - "Email signature?" (rich text editor)
4. **Auto-detect account age dan suggest warmup mode untuk akun baru < 90 hari**
5. Server Actions:
   - `listEmailAccounts`
   - `setDefaultEmailAccount`
   - `disconnectEmailAccount` (revoke token via Google)
   - `checkAccountHealth` (cek quota via Gmail profile API)
   - `updateAccountProfile` (business name, signature, default attachments)
6. Komponen "Account Selector" di sidebar dengan business name display
7. Quota indicator real-time per akun
8. **Warmup mode UI**: tampilkan progress warmup (Day 1/14, etc)
9. **Mismatch warning**: saat campaign create, kalau template mention "Tiska" tapi sender = visualtetra, kasih warning

### Deliverable
- User bisa add/remove Gmail account
- Token encrypted di DB
- **Setiap akun punya business profile (name, signature, default attachment)**
- Health status visible per akun
- **Warmup mode untuk akun baru otomatis aktif**
- Account selector berfungsi
- **Mismatch detection works**

### Test
- Add Gmail account → muncul di list
- Set business profile → tersimpan
- Disconnect → token revoked, gak ada di list
- Check health → quota tampil correct
- Connect akun baru < 30 hari → warmup mode auto-on dengan limit 5/day
- Create campaign mismatch → warning muncul

## Phase 6: Send Email Engine (Core) (Day 10-12, ~ 8-10 jam) ⭐ Paling Critical

### Goal
Bisa kirim email satu per satu via Gmail API dengan delay, tracking pixel injected.

### Sub-phases

#### 6.1 Gmail API Client (3 jam)
- `lib/gmail/send.ts` — fungsi sendEmail
- `lib/gmail/oauth.ts` — refresh token logic
- `lib/gmail/threads.ts` — get thread, check replies
- **Build RFC 822 multipart message dengan attachment support**
- Base64url encode untuk message + attachments
- **Download attachment dari Supabase Storage saat compose**

#### 6.2 Template Renderer (1.5 jam)
- `lib/templates/render.ts`
- Variable substitution dengan fallback
- HTML sanitization
- Inject tracking pixel
- Inject unsubscribe footer
- **Append email signature dari email account profile**
- **Include attachments (template + account default)**

#### 6.3 Send Job Queue (2 jam)
- Migration: pastikan `send_jobs` table ada
- Server Action `enqueueSendJob` saat campaign start

#### 6.4 Edge Function: email-sender-worker (3 jam) ⭐
- File: `supabase/functions/email-sender-worker/index.ts`
- Logic seperti di TSD:
  - Pick job dengan FOR UPDATE SKIP LOCKED
  - Loop recipients
  - Cek quota, send window
  - Render template
  - Send via Gmail API
  - Update status
  - Sleep random delay
  - Time budget management
- Deploy: `supabase functions deploy email-sender-worker --no-verify-jwt`

#### 6.5 pg_cron Schedule (30 menit)
- SQL: schedule worker tiap menit
  ```sql
  SELECT cron.schedule('email-sender', '* * * * *',
    $$SELECT net.http_post(
      url := 'https://[ref].supabase.co/functions/v1/email-sender-worker',
      headers := jsonb_build_object(
        'Authorization', 'Bearer [service-role-key]',
        'Content-Type', 'application/json'
      )
    )$$
  );
  ```

#### 6.6 Tracking Endpoints (1 jam)
- `/api/track/open/[id]/route.ts` → return GIF + log
- `/api/unsubscribe/[token]/route.ts` → public page

### Deliverable
- Bisa kirim email satu via Gmail API dari aplikasi
- Worker jalan tiap menit pick up jobs
- Tracking pixel berfungsi (open count update)

### Test ⭐ Critical
- Buat 1 contact (email diri sendiri)
- Buat campaign 1 recipient
- Start campaign
- Tunggu max 2 menit → email masuk inbox
- Buka email → opened_at update di DB
- Check Gmail API quota berkurang

## Phase 7: Campaign Builder (Day 13-15, ~ 8-10 jam)

### Goal
Wizard UI untuk bikin dan launch campaign.

### Tasks
1. Page `app/(app)/campaigns/new/page.tsx` dengan wizard 5 step
2. State management dengan Zustand (atau React Context)
3. Step 1: Setup (nama, sender, template)
4. Step 2: Audience (pilih kontak via filter)
5. Step 3: Schedule & Behavior
6. Step 4: Follow-up Rules (toggle + form)
7. Step 5: Review (preview 3 sample emails)
8. Server Action `createCampaignDraft` dan `startCampaign`
9. Validation di setiap step
10. Save as draft auto

### Deliverable
- User bisa buat dan launch campaign via wizard
- Preview menunjukkan rendered email per recipient

### Test
- Bikin campaign 5 recipient
- Launch
- Tunggu eksekusi
- Cek 5 email terkirim
- Status update real-time

## Phase 8: Campaign Detail & Tracking (Day 16-17, ~ 5-6 jam)

### Goal
View per campaign dengan stats, recipient list, status update real-time.

### Tasks
1. Page `app/(app)/campaigns/[id]/page.tsx`
2. Stats cards
3. Timeline chart (Recharts)
4. Recipient table dengan filter status
5. Pause/Resume buttons
6. Server Action `getCampaignStats`, `pauseCampaign`, `resumeCampaign`
7. Real-time updates via Supabase Realtime subscription (optional, atau polling)

### Deliverable
- Detail page lengkap
- Pause works (stop pending)
- Resume continues

### Test
- Pause campaign saat jalan → email pending stop
- Resume → lanjut

## Phase 9: Reply & Bounce Detection (Day 18-19, ~ 5-6 jam)

### Goal
Background workers detect reply dan bounce dari Gmail.

### Tasks
1. Edge Function: `reply-checker` (per TSD)
2. Edge Function: `bounce-checker`
3. Schedule via pg_cron
4. Update activity log
5. Update contact stats (total_replies, etc)
6. Test dengan kirim email ke teman, minta dia balas

### Deliverable
- Reply detected dalam 15 menit
- Bounce detected dalam 15 menit

### Test
- Kirim email ke akun lain
- Akun lain balas
- Tunggu 20 menit → status update ke replied

## Phase 10: Follow-up Sequences (Day 20-21, ~ 4-5 jam)

### Goal
Auto follow-up kalau gak dibalas.

### Tasks
1. Edge Function: `followup-scheduler`
2. Schedule via pg_cron tiap jam
3. Logic per FSD
4. UI di campaign builder dah ada (step 4)
5. Test dengan campaign yang ada FU rule, kasih threshold pendek (cth: 1 jam)

### Deliverable
- FU jalan otomatis
- Stop kalau dibalas

## Phase 11: Dashboard (Day 22-23, ~ 4-5 jam)

### Goal
Dashboard utama dengan stats dan activity feed.

### Tasks
1. Page `app/(app)/dashboard/page.tsx`
2. KPI cards
3. Charts (sent over time, open rate trend)
4. Activity feed
5. Health indicator
6. Server Action aggregate queries

### Deliverable
- Dashboard informative
- Load < 2 detik

## Phase 12: Settings & Polish (Day 24-25, ~ 5-6 jam)

### Goal
Settings page lengkap, polish UX.

### Tasks
1. Profile settings
2. Sending defaults
3. Tags management
4. Custom fields management
5. Privacy & data (export all, delete account)
6. Polish: loading states, error states, empty states
7. Mobile responsive check
8. Dark mode toggle

## Phase 13: Anti-Spam & Production Hardening (Day 26-28, ~ 6-8 jam)

### Goal
Aplikasi siap dipake serius tanpa kena ban.

### Tasks
1. Pre-send validation (spam score check)
2. Rate limiting
3. Better error messages
4. Sentry error tracking (optional)
5. Privacy policy & ToS pages
6. Onboarding flow untuk first-time user
7. Edukasi tooltip untuk best practices

### Deliverable
- App siap public
- Proper guardrails

## Phase 14: Optional Phase 2 Features

(Setelah MVP sukses dipake sebulan)
- AI personalization (Claude API integration)
- A/B testing
- Email warm-up
- Webhook integration

## Time Estimate Total

- Phase 0-2 (Setup + Auth): ~ 8 jam → 2 hari
- Phase 3 (Contacts): ~ 10 jam → 2-3 hari
- Phase 4 (Templates): ~ 6 jam → 1-2 hari
- Phase 5 (Gmail OAuth): ~ 5 jam → 1 hari
- Phase 6 (Send Engine): ~ 10 jam → 2-3 hari ⭐
- Phase 7 (Campaign Builder): ~ 10 jam → 2-3 hari
- Phase 8 (Detail/Tracking): ~ 6 jam → 1-2 hari
- Phase 9 (Reply/Bounce): ~ 6 jam → 1-2 hari
- Phase 10 (Follow-up): ~ 5 jam → 1 hari
- Phase 11 (Dashboard): ~ 5 jam → 1 hari
- Phase 12 (Settings/Polish): ~ 6 jam → 1-2 hari
- Phase 13 (Hardening): ~ 8 jam → 2 hari

**Total: ~ 85-95 jam coding** = 3-5 minggu kalau full-time, 6-10 minggu kalau sambilan.

Dengan vibe coding pakai Claude di Antigravity, bisa jauh lebih cepat — mungkin 30-50% dari estimate manual. Tapi tetap perlu testing manual dan polish, jadi expect realistic 3-5 minggu untuk MVP usable.

## Critical Path Dependencies

Yang gak bisa parallelized:
- Phase 1 (DB) blocks semua
- Phase 2 (Auth) blocks Phase 3+
- Phase 5 (Gmail OAuth) blocks Phase 6
- Phase 6 (Send Engine) blocks Phase 7
- Phase 7 (Campaign Builder) blocks Phase 8

Yang bisa parallelized (kalau punya 2 developer):
- Phase 3 (Contacts) dan Phase 4 (Templates) bisa parallel
- Phase 11 (Dashboard) bisa start kapan saja setelah Phase 8

## Testing Strategy Per Fase

Setiap fase ada checklist test manual. Sebelum lanjut fase berikut:
- Pastikan semua test pass
- Commit ke Git dengan message jelas
- Tag release di GitHub (v0.1, v0.2, dst)
- Deploy ke Vercel (otomatis via push)

## When Things Break

Common issues dan solusinya:
- "Token expired": cek refresh-tokens Edge Function jalan
- "Email gak terkirim": cek Edge Function logs di Supabase dashboard
- "Database 500MB hampir habis": archive campaigns > 90 hari
- "Vercel function timeout": pastikan heavy work udah pindah ke Edge Function
- "Supabase project paused": akses dashboard, manual resume, setup cron-job.org weekly ping

## Backup & Disaster Recovery

- Database: Supabase free tier gak punya automatic backup. Setup manual export weekly.
  - Setup GitHub Action: cron weekly export schema + data ke private repo
- Code: GitHub udah cover
- Configuration: Document env vars di password manager
