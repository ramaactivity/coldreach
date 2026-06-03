# 13 — Free Tier Maximization Strategy

Dokumen ini detail strategi memaksimalkan free tier services, terutama dengan leverage Google ecosystem (yang user udah pakai sehari-hari) untuk extend kapabilitas aplikasi tanpa biaya.

## Filosofi

**Setiap "free hack" harus diukur 3 hal:**
1. **ROI:** seberapa besar value vs complexity
2. **Risk:** seberapa fragile (rate limit, TOS, vendor lock-in)
3. **Maintenance burden:** ongoing cost dalam waktu dan attention

Jangan over-engineer. Mending pakai paid $25/bulan daripada bangun system rumit yang gampang rusak.

## Updated Free Tier Stack

### Original Stack
- Vercel Hobby (frontend + backend)
- Supabase Free (database + auth + storage)
- Gmail API (sending)

### Enhanced Stack
- Vercel Hobby (frontend + backend) ← stay
- Supabase Free (database + auth) ← keep
- **Google Drive (attachment + backup)** ← NEW
- **Google Sheets API (export only)** ← NEW
- Gmail API (sending) ← stay
- **Google Gemini API (AI personalization)** ← NEW
- pg_cron (scheduled jobs) ← keep
- GitHub (code + config backup) ← keep

## Critical Additions to MVP

### 1. ⭐ Google Drive sebagai Attachment Storage

**Replace:** Supabase Storage (1GB limit)
**With:** Google Drive (15GB per Gmail account, user has 3 accounts = 45GB potential)

#### Implementation:

OAuth scope yang ditambah saat connect Gmail account:
```
https://www.googleapis.com/auth/drive.file
```

Scope ini RESTRICTED to files yang dibuat oleh app (gak bisa akses file user lain). Lebih aman.

Saat user upload attachment ke template:
```typescript
// 1. Upload ke Drive di folder app khusus
const driveFile = await uploadToDrive({
  accountToken: emailAccount.accessToken,
  filename: 'tiska-company-profile.pdf',
  content: fileBuffer,
  parentFolderId: APP_FOLDER_ID, // pre-created folder "ColdReach"
  mimeType: 'application/pdf'
});

// 2. Make accessible (anyone with link can view)
await setDrivePermission(driveFile.id, 'reader', 'anyone');

// 3. Save reference di database
await db.template_attachments.insert({
  template_id,
  drive_file_id: driveFile.id,
  drive_file_url: `https://drive.google.com/uc?id=${driveFile.id}`,
  filename: 'tiska-company-profile.pdf',
  size_bytes: driveFile.size
});
```

Saat send email:
```typescript
// Option A: Embed sebagai attachment (download dari Drive, attach)
const fileContent = await downloadFromDrive(driveFile.id);
gmailMessage.attachments.push({
  filename, content: fileContent, mimeType
});

// Option B: Embed sebagai link (Drive icon di Gmail)
emailBody += `<a href="${driveFile.url}">📎 ${filename}</a>`;
```

Recommend **Option A** untuk professional look, attachment proper.

#### Schema update:
```sql
-- Replace template_attachments storage_path
ALTER TABLE public.template_attachments
  RENAME COLUMN storage_path TO drive_file_id;

ALTER TABLE public.template_attachments
  ADD COLUMN drive_file_url TEXT,
  ADD COLUMN owner_email_account_id UUID REFERENCES public.email_accounts(id);
```

#### Folder Structure di Drive:
```
ColdReach/
├── Templates/
│   ├── workspace_tiska/
│   │   ├── tiska-company-profile.pdf
│   │   └── menu-2026.pdf
│   ├── workspace_photobooth/
│   │   └── photobooth-portfolio.pdf
│   └── workspace_visual/
└── Backups/
    ├── 2026-05-05.json
    ├── 2026-04-28.json
    └── ...
```

#### Considerations:
- Gmail attachment max 25MB. Kalau file > 25MB di Drive, otomatis send sebagai link (Gmail behavior)
- Drive API rate limit: 1000 queries per 100 seconds per user. Cukup untuk normal use.
- Kalau user disconnect Gmail account, ada warning: "File di Drive masih ada, tapi gak bisa di-access via app sampai reconnect"

---

### 2. ⭐ Weekly Database Backup ke Google Drive

**Replace:** Manual export atau no-backup
**With:** Auto weekly export ke Drive (gratis, robust)

#### Implementation:

Edge Function `weekly-backup`:
```typescript
// Setiap Senin 00:00 WIB
// 1. Query all user data
const data = {
  workspaces: await db.workspaces.select('*'),
  contacts: await db.contacts.select('*'),
  templates: await db.templates.select('*'),
  campaigns: await db.campaigns.select('*'),
  // ...
};

// 2. Compress (optional, JSON gzip ~70% reduction)
const json = JSON.stringify(data);
const compressed = gzip(json);

// 3. Upload to Drive
const filename = `coldreach-backup-${new Date().toISOString().split('T')[0]}.json.gz`;
await uploadToDrive({
  accountToken: primaryEmailAccount.token,
  filename,
  content: compressed,
  parentFolderId: BACKUPS_FOLDER_ID,
  mimeType: 'application/gzip'
});

// 4. Cleanup old backups (keep 8)
const oldBackups = await listDriveFiles(BACKUPS_FOLDER_ID, { orderBy: 'createdTime' });
for (const old of oldBackups.slice(0, -8)) {
  await deleteDriveFile(old.id);
}
```

#### Schedule via pg_cron:
```sql
SELECT cron.schedule(
  'weekly-backup',
  '0 0 * * 1', -- Every Monday 00:00
  $$ SELECT net.http_post(
    url := 'https://[ref].supabase.co/functions/v1/weekly-backup',
    headers := jsonb_build_object('Authorization', 'Bearer [service-role-key]')
  ) $$
);
```

#### Benefits:
- Disaster recovery: kalau Supabase down/data lost, restore dari Drive
- User can self-restore jika ada masalah account
- Audit trail: monthly snapshot semua data

#### Restore flow (manual, admin only):
- Settings → "Restore from Backup"
- Pilih backup date
- Preview perubahan
- Confirm restore

---

### 3. ⭐⭐⭐ Google Gemini API untuk AI Personalization

**Game changer.** Ini bedain app lu dari sekedar mail merge biasa.

**Free tier Gemini API:**
- Gemini 2.5 Flash: 15 RPM, 1500 RPD
- Untuk volume 100 email/hari, lebih dari cukup
- 100% free, no credit card needed

#### Use Case: AI-Generated Personal Opener

Sebelum kirim email, generate 1-2 sentence opener yang reference recipient specific.

```typescript
// Untuk kontak Bella Hs - HR Manager Kreston Indonesia
const prompt = `
You are writing a cold email opener (1-2 sentences, professional warm Indonesian).

Recipient:
- Name: Bella Hs
- Position: HR Manager
- Company: Kreston Indonesia (accounting/audit firm)

Context: Tiska Catering reaching out to offer corporate catering services.

Generate ONLY the opener (no greeting, no closing).
Make it specific to their role/company. Don't mention catering yet.
Style: warm, observant, like you've researched them briefly.
Max 30 words.
`;

const opener = await gemini.generate(prompt);
// Output: "Saya melihat Kreston Indonesia banyak menggelar event internal untuk
// tim audit yang tersebar di berbagai cabang—pasti banyak koordinasi konsumsi 
// yang perlu dipikirkan."
```

Inject ke template di placeholder `{{ai_opener}}`:
```
Dear Bapak/Ibu {{first_name}},

{{ai_opener}}

Tiska Catering hadir untuk membantu...
```

#### Smart Generation Strategy:

**Tier 1: Basic (low cost)** — opener berdasarkan position/company name
**Tier 2: Enhanced** — pakai company description (kalau ada)
**Tier 3: Premium** — incorporate recent news (kalau pakai search)

Default Tier 1, user bisa upgrade kalau butuh.

#### Cost & Rate Management:
- Cache opener per kontak (gak generate ulang kalau campaign yang sama)
- Pre-generate batch (saat campaign create, generate untuk semua recipient sekaligus)
- Rate limit handler: 15 RPM, jadi spread across time

#### Schema:
```sql
CREATE TABLE public.ai_generations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  generation_type TEXT NOT NULL, -- 'opener', 'subject', 'follow_up'
  prompt_hash TEXT, -- untuk cache hit
  generated_content TEXT NOT NULL,
  model_used TEXT DEFAULT 'gemini-2.5-flash',
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ai_gen_cache ON public.ai_generations(contact_id, generation_type, prompt_hash);
```

#### UI Integration:

Saat compose template, ada tombol "Insert AI Opener":
```
Subject: [_________________________]

Dear Bapak/Ibu {{first_name}},

[+ AI Personal Opener (will be generated per recipient)]
{{ai_opener}}

Tiska Catering hadir untuk...
```

Saat preview campaign, generate sample dengan 3 kontak random:
```
Preview email:

To: bella.hs@kreston.co.id
Opener: "Saya melihat Kreston Indonesia banyak menggelar event internal..."

To: alif@kalibrr.com
Opener: "Kalibrr punya komunitas user yang aktif, dengan event launching dan 
gathering yang regular tentu butuh konsumsi yang reliable..."

To: bandang@drinkiss.co.id
Opener: "Sebagai brand minuman yang lagi tumbuh, momentum tim Drinkiss tentu 
sering diramaikan oleh meeting strategis dan brainstorming..."
```

User bisa accept/regenerate per recipient sebelum send.

#### Strategi Subject Line Variation:
Generate 3 subject line variants per campaign menggunakan AI:
```
Original subject: "Solusi catering untuk event Anda"

AI variants:
1. "Bantu Bella siapkan catering event Q2 Kreston?"
2. "Buka bersama Kreston 2026, sudah siap?"
3. "Tim Kreston layak makan enak hari ini"
```

A/B test otomatis: split campaign ke 3 variant, lihat mana yang highest open rate.

---

### 4. Export to Google Sheets

**User-facing feature.** Export data ke Sheet untuk analisis manual / share / archive.

#### Implementation:

```typescript
async function exportToGoogleSheets(
  workspaceId: string, 
  type: 'contacts' | 'campaign_report' | 'templates',
  filters?: any
) {
  // 1. Create new spreadsheet
  const sheet = await sheetsApi.create({
    title: `ColdReach Export - ${type} - ${new Date().toISOString()}`
  });

  // 2. Get data
  const data = await getDataForExport(workspaceId, type, filters);

  // 3. Batch write
  await sheetsApi.values.update({
    spreadsheetId: sheet.id,
    range: 'A1',
    valueInputOption: 'RAW',
    values: [headers, ...data]
  });

  // 4. Apply formatting (optional)
  await sheetsApi.batchUpdate({
    spreadsheetId: sheet.id,
    requests: [
      { repeatCell: { /* bold first row */ } },
      { autoResizeDimensions: { /* auto-fit columns */ } }
    ]
  });

  return sheet.spreadsheetUrl;
}
```

#### UI:
- Setiap list view ada button "Export to Sheets" 
- Filter aktif di-respect (export filtered data)
- Show progress: "Creating sheet..." → "Done! Open in Google Sheets"
- Sheet di-create di Drive user, milik user (bukan app)

#### Use cases:
- Bulanan: report ke atasan/partner
- Backup readable
- Pivot/chart analysis
- Share view-only ke kolaborator (Tetra Photobooth co-founder?)

---

## Cron Job Consolidation

Replace external cron service dengan pg_cron:

```sql
-- Email sender worker (every minute)
SELECT cron.schedule(
  'email-sender',
  '* * * * *',
  $$ SELECT net.http_post(
    url := 'https://[ref].supabase.co/functions/v1/email-sender-worker',
    headers := jsonb_build_object('Authorization', 'Bearer [SR-key]')
  ) $$
);

-- Reply checker (every 15 min)
SELECT cron.schedule(
  'reply-checker',
  '*/15 * * * *',
  $$ SELECT net.http_post(
    url := 'https://[ref].supabase.co/functions/v1/reply-checker',
    headers := jsonb_build_object('Authorization', 'Bearer [SR-key]')
  ) $$
);

-- Bounce checker (every 15 min)
SELECT cron.schedule(
  'bounce-checker',
  '*/15 * * * *',
  $$ SELECT net.http_post(
    url := 'https://[ref].supabase.co/functions/v1/bounce-checker'
  ) $$
);

-- Token refresh (every 50 min)
SELECT cron.schedule(
  'token-refresh',
  '*/50 * * * *',
  $$ SELECT net.http_post(
    url := 'https://[ref].supabase.co/functions/v1/refresh-tokens'
  ) $$
);

-- Followup scheduler (every hour)
SELECT cron.schedule(
  'followup-scheduler',
  '0 * * * *',
  $$ SELECT net.http_post(
    url := 'https://[ref].supabase.co/functions/v1/followup-scheduler'
  ) $$
);

-- Daily stats (midnight)
SELECT cron.schedule(
  'daily-stats',
  '0 17 * * *', -- UTC 17:00 = WIB 00:00
  $$ SELECT reset_daily_quotas() $$
);

-- Weekly backup to Drive (Monday midnight)
SELECT cron.schedule(
  'weekly-backup',
  '0 17 * * 0', -- UTC Sunday 17:00 = Senin 00:00 WIB
  $$ SELECT net.http_post(
    url := 'https://[ref].supabase.co/functions/v1/weekly-backup'
  ) $$
);

-- Self-ping anti pause (every 6 days)
SELECT cron.schedule(
  'keep-alive',
  '0 0 */6 * *',
  $$ SELECT net.http_get('https://yourapp.vercel.app/api/health') $$
);

-- Activity log cleanup (daily)
SELECT cron.schedule(
  'cleanup-activity-log',
  '0 18 * * *', -- 01:00 WIB
  $$ DELETE FROM public.activity_log WHERE created_at < now() - interval '30 days' $$
);
```

Total invocations/bulan: ~50,000 (well within 500K free limit).

---

## Calculated Free Tier Capacity (Updated)

### Storage berdasarkan stack baru:

| Resource | Free Tier | Strategy |
|----------|-----------|----------|
| Postgres DB | 500 MB | Schema lean, archive > 90 days |
| Supabase Storage | 1 GB | Skip, pakai Drive |
| **Google Drive (per Gmail)** | **15 GB** | Attachment + backup |
| **Drive total (3 Gmail)** | **45 GB** | If needed for scale |
| GitHub repo | 1 GB | Code + schema backup |
| Vercel cache | unlimited | Static assets |

### Compute capacity:

| Resource | Free Tier | Used Estimate | Headroom |
|----------|-----------|---------------|----------|
| Vercel function invoc | 100K/mo | ~10K/mo | 10x |
| Vercel bandwidth | 100GB/mo | ~5GB/mo | 20x |
| Supabase Edge Func | 500K/mo | ~50K/mo | 10x |
| pg_cron tasks | unlimited | ~50K/mo | infinite |
| Gmail API quota | 1B units/day | ~10K/day | infinite |
| **Gemini API** | **1500 req/day** | **~200/day** | **7x** |
| Drive API | 1000/100s | ~100/min | 10x |
| Sheets API | 300/min read | < 10/min | 30x |

### Bottom line:
Dengan optimisasi ini, app bisa handle:
- **Up to 1,000 contacts active per day**
- **Up to 200 emails/day** dengan AI personalization
- **Up to 100 campaigns/bulan**
- **Multiple year history**

Sebelum kena limit any service. Strong free tier coverage.

---

## Phase Adjustment

### Add to Phase 4 (Templates):
- Drive integration untuk attachment
- Migrate from Supabase Storage to Drive

### Add to Phase 5 (Email Accounts):
- Add `drive.file` scope
- Setup Drive folder structure per workspace

### Add to Phase 6.5 (NEW): AI Personalization Layer
- Gemini API integration
- AI opener generation
- Per-contact caching
- Subject line variation
- A/B testing infrastructure (basic)

### Add to Phase 11 (Dashboard):
- Export to Sheets buttons

### Add to Phase 13 (Hardening):
- Weekly backup Edge Function
- Self-ping cron
- Drive folder cleanup logic

---

## Risk & Mitigation

### Risk 1: Drive API quota hit saat banyak attachment download
**Mitigation:** 
- Cache file content in memory selama campaign berjalan
- Download once per campaign, reuse untuk semua recipient

### Risk 2: Gemini API rate limit (1500/day)
**Mitigation:**
- Cache AI generation per contact (gak regen kalau template sama)
- Batch generation di campaign create (1 burst, then no more for that campaign)
- Fallback: kalau rate limit hit, skip AI dan kirim plain template

### Risk 3: User disconnect Gmail, attachments di Drive jadi inaccessible
**Mitigation:**
- Migrate attachment ke Gmail account workspace lain saat disconnect
- Atau warning ke user: "File di Drive akan jadi inaccessible, download dulu"

### Risk 4: Google ubah TOS atau policy
**Mitigation:**
- Architecture decoupled: Drive storage bisa di-swap ke Supabase storage atau S3 anytime
- Backup tetap di multiple place (Drive + GitHub schema)

### Risk 5: User pakai Gmail yang sama untuk personal & app, accidentally delete file ColdReach folder
**Mitigation:**
- Folder name unique: "ColdReach App Data — DO NOT MODIFY"
- Hidden: pakai folder property `appProperties` bukan visible folder
- Recovery: rebuild dari Supabase database (kecuali attachment, perlu re-upload)

---

## Future Considerations (Phase 3+)

### Hunter.io API Integration (free tier 25/mo)
- Email verification before send
- Find missing emails

### LinkedIn integration via OAuth
- Auto-enrich contact data
- Send connection request alongside email

### WhatsApp Cloud API (free tier 1000 msg/mo)
- Multi-channel: email + WA
- Especially for Indonesian context where WA is primary

### Cloudflare Workers migration path
- Kalau Vercel limit tercapai
- Edge deploy untuk fast Indonesian access

### BigQuery untuk analytics (free tier 10GB queries/mo)
- Heavy analytics yang berat di Postgres
- Trend analysis multi-tahun

---

## Conclusion

Strategi free tier yang aggressive tapi sustainable:

1. ✅ Storage: pakai Drive 15GB+ per akun (vs Supabase 1GB)
2. ✅ Backup: weekly auto ke Drive (vs none / manual)
3. ✅ AI: Gemini gratis (vs paid Claude/OpenAI $20+/bulan)
4. ✅ Cron: pg_cron only (vs cron-job.org external)
5. ✅ Export: native Sheets integration (UX bonus)

**Estimated additional dev time:** 8-12 jam
**Estimated value vs paid alternatives:** $50-100/bulan saved

**Worth it.** Implement di MVP atau Phase 1.5 paling lambat.
