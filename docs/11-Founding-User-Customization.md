# 11 — Founding User Profile & Critical Updates

Dokumen ini detail spesifik untuk founding user (Muhamad Ramadan Saputra / Tiska Catering) berdasarkan info konkret yang dikumpulkan. Spec di file 01-10 udah generic, dokumen ini adalah customization layer yang harus dijadikan prioritas pertama saat development.

## 1. Founding User Profile

### Identitas
- **Nama:** Muhamad Ramadan Saputra
- **Role:** Sales/Marketing — Tiska Catering
- **Lokasi:** Bogor
- **Bisnis sampingan:** Tetra Photobooth, Visual Tetra
- **Skill coding:** 0% (mengandalkan vibe coding via Claude di Antigravity)

### Multi-Business Reality (Multi-Workspace)
User punya 3 bisnis yang BERBEDA, masing-masing dengan email Gmail terpisah:

| Email | Bisnis | Umur | Reputation | Audience | Pipeline |
|-------|--------|------|------------|----------|----------|
| catering.tiska@gmail.com | Tiska Catering | Lama (2+ tahun) | ⭐⭐⭐⭐ | HR/GA Corporate | Catering pipeline |
| tetraphotobooth@gmail.com | Tetra Photobooth | 2 tahun | ⭐⭐⭐ | EO, Wedding, Corporate Event | Photobooth pipeline |
| visualtetra@gmail.com | Visual Tetra | 1 bulan | ⭐ RAWAN | Design clients | Visual pipeline |

**CRITICAL: Ini BUKAN multi-account untuk satu bisnis (rotasi).** 
Ini adalah **3 bisnis terpisah yang dijalankan oleh user yang sama**, berbagi database kontak yang sama.

### Architecture Implication: Multi-Workspace
Lihat **docs/12-Multi-Workspace-Architecture.md** untuk detail lengkap.

Singkatnya:
- 1 user account → bisa punya multiple workspace
- 1 workspace = 1 bisnis (Tiska, Photobooth, Visual)
- 1 workspace memiliki 1 email account
- Contacts dishare di user level (akses semua workspace)
- Templates, campaigns, pipeline TERPISAH per workspace
- Cross-workspace coordination (anti-flood, smart suggestions)

### Implication untuk app:
- **Multi-workspace adalah CORE FEATURE**, bukan optional
- Setiap workspace punya identity terpisah (logo, signature, attachments)
- Pipeline lifecycle berbeda per workspace
- Cross-workspace anti-flood untuk protect recipient experience
- visualtetra (1 bulan) workspace-nya akan force warmup mode otomatis

## 2. Existing Email Template Analysis

User udah punya template kualitas profesional. Sample yang ditemukan dari Gmail drafts:

### Template Active List (dari screenshot Gmail Drafts):
1. "[Undangan Eksklusif] Food Tasting Gratis Tiska Catering – Cocok untuk Event Ramadan & ..."
2. "Complimentary Food Tasting to ..." (English variant)
3. "Food Tasting Invitation for {{Company}}"
4. "Penawaran Khusus + Undangan ..."
5. "Bingung Konsumsi untuk Gathering ..."
6. "Penawaran Khusus + Un..." (variation)

### Template Sample (yang aktif):
```
Subject: [Undangan Eksklusif] Food Tasting Gratis Tiska Catering – Cocok untuk Event Ramadan & ...

Dear Bapak/Ibu {{First name}},

Menjelang Ramadan dan Lebaran, banyak perusahaan mulai mempersiapkan agenda buka 
bersama, kebutuhan konsumsi kantor, hingga hampers sebagai bentuk apresiasi bagi 
tim dan relasi bisnis.

Kami memahami bahwa periode ini sering kali cukup padat. Karena itu, Tiska Catering 
hadir untuk membantu agar seluruh kebutuhan konsumsi dapat dipersiapkan dengan rapi, 
tepat waktu, dan tanpa menambah keribetan bagi tim internal.

Kami menyediakan:
• Paket konsumsi berbuka iftar & acara kantor
• Hampers Ramadan & Lebaran (custom sesuai kebutuhan perusahaan)
• Kue dan snack premium untuk corporate gifting

Sebagai langkah awal, kami menawarkan food tasting gratis yang dapat kami kirimkan 
langsung ke kantor {{Company}}, sehingga Bapak/Ibu dapat memastikan rasa dan 
kualitasnya terlebih dahulu.

Apabila {{Company}} sedang merencanakan agenda Ramadan atau Lebaran, kami akan 
dengan senang hati menyesuaikan penawaran dan jadwal sesuai kebutuhan.

[PDF Attachment: E-COMPANY PROFILE]
```

### Karakteristik template lu yang bagus:
- ✅ Personal opening dengan First name
- ✅ Context-aware (seasonal: Ramadan, Lebaran)
- ✅ Empathy first (memahami pain point HR)
- ✅ Value prop dengan bullet (scannable)
- ✅ Reference perusahaan recipient (`{{Company}}`)
- ✅ Low-commitment CTA (food tasting gratis)
- ✅ Profesional tone (Bahasa Indonesia formal yang appropriate)
- ✅ Visual proof (PDF company profile attached)

### Yang BISA di-improve oleh app baru:
- ❌ Pakai `{{First name}}` (case-sensitive) → app pakai `{{first_name}}` (lowercase, consistent)
- ❌ Subject line gak ada variasi → A/B test 2-3 subject
- ❌ Generic "Bapak/Ibu" → bisa lebih personal kalau tau gender (atau pake nama langsung)
- ❌ Gak ada tracking pixel → ada di app
- ❌ Gak ada unsubscribe link → wajib di app (legal)

## 3. Critical Feature Addition: PDF Attachment Support

**Ini missing dari spec original.** Email Tiska SELALU pakai PDF company profile attachment. Tanpa ini, app gak usable untuk Tiska.

### Update untuk PRD:
Tambah ke Phase 1 (MVP) Section 5.3 Templates:
- Template support attachments (file upload, max 5MB per file, max 3 file per template)
- Attachment disimpan di Supabase Storage (1GB free tier)
- Saat send, attachment di-include via Gmail API multipart message

### Update untuk Database Schema:
Tambah ke `templates` table:
```sql
ALTER TABLE public.templates ADD COLUMN attachments JSONB DEFAULT '[]'::jsonb;
-- Format: [{ filename, storage_path, size_bytes, mime_type }]
```

Atau bikin tabel terpisah untuk normalization:
```sql
CREATE TABLE public.template_attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL, -- path di Supabase Storage
  size_bytes INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Update untuk send logic:
Saat kirim via Gmail API, build multipart message dengan attachment:
```typescript
// Pseudocode
const message = createMultipartMessage({
  to, from, subject, htmlBody, plainBody,
  attachments: template.attachments.map(att => ({
    filename: att.filename,
    content: await downloadFromStorage(att.storage_path),
    mimeType: att.mime_type
  }))
});
```

### Storage strategy untuk free tier 1GB:
- Single PDF company profile pakai bersama untuk semua template (1 file × 1MB = 1MB)
- Per template gak duplicate file, tapi reference shared file
- Compress PDF kalau > 2MB (warning to user)
- Soft limit: max 100MB total per user (warning saat mendekati)

## 4. Critical Feature Addition: Email Account Profile

User punya 3 Gmail dengan business identity berbeda. App harus support concept "Email Account Profile":

### Update untuk Database Schema:
```sql
ALTER TABLE public.email_accounts 
  ADD COLUMN business_name TEXT,        -- "Tiska Catering"
  ADD COLUMN business_logo_url TEXT,    -- optional
  ADD COLUMN signature_html TEXT,        -- HTML signature
  ADD COLUMN default_attachment_ids UUID[]; -- attachment yg auto-include
```

### UX Pattern:
Saat user connect Gmail account, wizard tanya:
1. "Akun ini untuk bisnis apa?" (text)
2. "Upload signature gambar atau buat signature text?" (optional)
3. "Apakah ada attachment default untuk akun ini?" (cth: company profile PDF)

Saat compose campaign, sistem:
- Default sender = email account dengan business yang match konteks template
- Warning kalau ada mismatch (cth: user pilih template "Catering Outreach" tapi sender = visualtetra)
- Auto-include default attachments per akun

## 5. Critical Feature Addition: Gmail Labels Migration

User udah punya organization via Gmail labels:
- Followup Lagi
- Menanyakan Pricelist
- OUT OF OFFICE
- Pitching
- Tertarik Food Tasting

Ini essentially **lifecycle stages** yang user udah pakai. App harus capture ini.

### Update untuk Migration Plan:
Saat first-time setup:
1. Auto-fetch Gmail labels user
2. Suggest mapping ke contact tags atau custom field "Lead Stage":
   - "Tertarik Food Tasting" → tag `interested-tasting` atau lead_stage = "interested"
   - "Menanyakan Pricelist" → tag `asked-pricelist` atau lead_stage = "evaluating"
   - "Followup Lagi" → tag `followup-needed`
   - "OUT OF OFFICE" → tag `auto-reply` (low priority)
   - "Pitching" → tag `pitching` atau lead_stage = "pitching"

3. Untuk EACH label, fetch email yang punya label itu, extract sender email, match dengan contact yang ada di database, apply tag.

### Database update:
Tambah field opsional ke contacts:
```sql
ALTER TABLE public.contacts 
  ADD COLUMN lead_stage TEXT, -- new, contacted, interested, evaluating, pitching, won, lost
  ADD COLUMN lead_stage_updated_at TIMESTAMPTZ,
  ADD COLUMN priority TEXT DEFAULT 'medium'; -- low, medium, high
```

### UI: Pipeline View (Phase 2 priority bumped to Phase 1)
Tampilkan kontak dalam Kanban-style pipeline:
```
[New] [Contacted] [Interested] [Pitching] [Won] [Lost]
  450     230         45          12        3      89
```
Drag-drop kontak antar stage. Atau auto-progress berdasarkan engagement (replied → contacted, etc).

## 6. Database Sizing Strategy untuk 10,000 Kontak

### Realitas:
- 10,000 contacts × 1KB avg = 10MB (manageable)
- Issue: campaign_recipients akan explode
  - Kalau lu kirim 100 email/hari × 365 hari = 36,500 records/tahun
  - 10,000 contact × 5 campaign rata-rata = 50,000 recipient records
  - Plus snapshot rendered_body_html (besar!)
  - Setelah setahun = 100MB+ untuk recipient records aja

### Update untuk schema:
Hapus `rendered_body_html` snapshot per recipient (terlalu mahal), simpan hanya:
- Reference ke template snapshot di campaign level
- Variable values yang dipakai (small jsonb)

```sql
-- Replace
ALTER TABLE public.campaign_recipients 
  DROP COLUMN rendered_body_html;

-- With (lighter)
ALTER TABLE public.campaign_recipients 
  ADD COLUMN variables_used JSONB DEFAULT '{}'::jsonb;
-- Format: { first_name: "Bella", company: "Kreston" } - cuma values yg dipake
```

Untuk reproduce email yang dikirim (kalau perlu audit):
- Take template snapshot dari campaign
- Render dengan variables_used dari recipient

### Auto-archiving strategy:
Background job tiap minggu:
- Campaign yang completed > 90 hari → move ke `campaigns_archive` table
- Campaign archive table di-compress (full row → JSONB summary)
- User tetap bisa view archived data, tapi gak bisa edit/resume

```sql
CREATE TABLE public.campaigns_archive (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  archived_at TIMESTAMPTZ DEFAULT now(),
  campaign_data JSONB NOT NULL, -- compressed campaign + recipients + stats
  total_size_bytes INTEGER
);
```

### Estimasi storage realistic untuk Tiska:
- Tahun 1: ~ 50MB
- Tahun 2: ~ 80MB (dengan archiving)
- Free tier 500MB: enough untuk 5+ tahun

### Apollo.io data quality bonus:
Source Apollo.io berarti email udah verified (Apollo verifies emails). Implications:
- Bounce rate harusnya < 2% (excellent)
- Boleh skip aggressive validation di import
- Gak perlu MX check tambahan

## 7. Recommended Initial Daily Quota per Account

Berdasarkan reputation umur akun:

| Account | Recommended Daily Quota | Warmup Period |
|---------|------------------------|---------------|
| catering.tiska@gmail.com | 50/day (proven) | None — udah established |
| tetraphotobooth@gmail.com | 30/day | None — but conservative |
| visualtetra@gmail.com | 5-15/day | 14 hari warmup mandatory |

**Aplikasi harus:**
- Saat connect new account, auto-detect umur estimate (kalau bisa via Gmail API)
- Untuk akun baru < 90 hari, force warmup mode dengan ramp-up:
  - Week 1: max 5/day
  - Week 2: max 15/day
  - Week 3: max 25/day
  - Week 4+: full quota
- User bisa override tapi dengan strong warning

## 8. Phase 1 Priorities Adjustment

Berdasarkan founding user reality, adjust prioritas Phase 1:

### MUST-HAVE for first usable version:
1. ✅ Auth + Multi-Gmail account
2. ✅ Contact CRUD + import 10,000 contacts smoothly
3. ✅ Template editor + variable
4. **🆕 Template attachment (PDF support)** ← bumped to MVP
5. **🆕 Multi-account profile (business identity)** ← bumped to MVP
6. ✅ Campaign send dengan delay
7. ✅ Open tracking
8. **🆕 Gmail Labels import sebagai tags** ← migration helper
9. ✅ Reply detection
10. ✅ Basic dashboard

### NICE-TO-HAVE (Phase 2):
- Pipeline kanban view
- A/B testing subject
- AI personalization
- Domain warmup tools
- Advanced analytics

## 9. Priority Tagging untuk Tiska's 10K Contacts

Saat import 10K contacts, app harus help user prioritize:

### Smart import suggestions:
- Auto-detect domain tier:
  - Big corp domains (.co.id, BUMN list) → `priority: high`
  - Generic gmail.com → `priority: low`  
  - Industry match (manufacturing, banking) → `priority: high`
- Auto-detect job title relevance:
  - "Director", "Manager" + GA/HR → `priority: high`
  - "Staff", "Officer" → `priority: medium`
  - Unclear → `priority: medium`

### Saved filters pre-loaded:
- "🔥 High Priority — Belum Pernah Dikirim" (filter: priority=high, status=active, never contacted)
- "📍 Bogor — Recent Activity" (filter: tag=bogor, last_contacted > 30 days)
- "💬 Yang Pernah Reply" (filter: total_replies > 0)
- "🌟 Tertarik Food Tasting" (filter: tag=interested-tasting)
- "⏰ Need Follow-up" (filter: status=opened, no reply, sent > 3 days ago)

## 10. Workflow yang Match dengan Tiska's Reality

### Daily routine pagi (5 menit):
```
1. Buka app → Dashboard
2. Liat: "Quota tersisa: 50 (catering.tiska) + 30 (tetraphotobooth) = 80 today"
3. Liat: "12 reply baru kemarin" → klik review (link ke Gmail langsung untuk reply manual)
4. Liat: "8 contact siap follow-up #1" → 1-click trigger sequence
5. Liat: "Tertarik Food Tasting (45)" → trigger nurture campaign
6. Tutup app, lanjut kerja
```

### Weekly outreach campaign (10 menit):
```
1. Senin pagi: Open app
2. New Campaign:
   - Pilih segment: "🔥 High Priority — Belum Pernah Dikirim — Bogor" (saved filter)
   - Pilih template: "Cold Outreach: Catering Q2"
   - Sender: catering.tiska@gmail.com (auto-detected match)
   - Spread: send 50 over 6 hours, jam 09:00-15:00
3. Preview 3 sample → ok
4. Start
5. Selesai, lanjut kerja
6. Sore: Cek dashboard, 50/50 sent, 12 opened
```

### Saat ada event seasonal (Ramadan, year-end):
```
1. Filter: tag=corporate, lead_stage=interested OR pitching
2. New Campaign: "Ramadan Special Offer"
3. Personalize: pakai variable {{Company}}, {{first_name}}
4. Schedule: weekly drip 3 weeks before Ramadan
```

## 11. Specific Anti-Spam untuk Volume 100/day

User udah blast 100/day konsisten. Risk profile:
- Reputation `catering.tiska` udah build, tapi di "watch list"
- Gmail mungkin auto-classify based on patterns
- Recipient kadang nanya "darimana?" — actually positive, but pattern detection might flag

### Strategi konkret untuk preserve reputation:
1. **Ramp-down kalau pattern danger**: kalau bounce rate spike > 3%, app auto-pause dan suggest pause 48 jam
2. **Mix manual interaction**: prompt user untuk balas email manual sesekali (bukan auto-reply)
3. **Conversation history check**: kalau kontak udah pernah balas, downgrade priority (jangan blast lagi, treat as lead)
4. **Variation in subject line**: A/B test rotation, hindari pattern repetitif
5. **Time-of-day variation**: jangan selalu jam 9 pagi, randomize 9-11
6. **Day variation**: Selasa-Kamis best, hindari Senin pagi (overload) dan Jumat sore

## 12. Onboarding Flow untuk Tiska (Specific)

Saat first-time login, customize onboarding berdasarkan detected context:

```
Step 1: Welcome
"Hai Muhamad! Selamat datang di ColdReach."

Step 2: Connect Gmail Accounts
"Connect akun Gmail untuk outreach. Anda bisa connect lebih dari satu."
→ Connect catering.tiska@gmail.com (primary)
→ "Mau connect akun lain? Tetraphotobooth & Visual Tetra?"

Step 3: Account Profile
Untuk tiap akun:
"Akun catering.tiska@gmail.com untuk bisnis apa?"
→ Tiska Catering
"Upload company profile PDF (opsional)?"
→ [upload]
"Buat signature?"
→ [text editor]

Step 4: Import Contacts
"Anda punya database existing?"
→ Yes, dari Google Sheet
→ Paste link / upload CSV
→ Detect: 10,234 contacts, columns auto-mapped
→ "Smart suggestions: tag region, priority, lead stage"
→ [Apply]

Step 5: Migrate Gmail Templates
"Detect 8 draft email di Gmail Anda. Mau di-import sebagai template?"
→ [Select all] [Import]

Step 6: Migrate Gmail Labels
"Detect labels: Followup Lagi, Menanyakan Pricelist, OUT OF OFFICE, Pitching, Tertarik Food Tasting. 
Map to tags?"
→ [Auto-map]
→ "8,234 contact ter-tag dari email history"

Step 7: First Campaign Suggestion
"Berdasarkan data, suggested first campaign:
- Segment: 'Tertarik Food Tasting' (45 contacts)
- Template: 'Food Tasting Follow-up' (warmest leads)
- Account: catering.tiska@gmail.com
- Schedule: today 10:00"
→ [Start]
```

## 13. Specific Improvements vs Old System

### Old: "Susah cari kontak tertentu"
**New solution:**
- Global search bar (Cmd+K) dengan instant search
- Search by nama, email, company, tag, notes
- Recent contacts shortcut
- Last interaction timeline per kontak

### Old: "Lupa udah pernah email siapa"
**New solution:**
- Per-contact email history (timeline view)
- "Email pernah dikirim ke kontak ini?" badge in every list
- Auto-warning saat compose: "Anda pernah email kontak ini 12 hari lalu" 
- Deduplication strict di campaign level

### Old: "Template generic karena males ganti-ganti"
**New solution:**
- Template library dengan kategori
- Quick variation: 1 template, 3-5 subject line variants
- AI-assisted variation (Phase 2): "Buat 3 versi template ini dengan tone berbeda"
- Smart suggestions: "Untuk segment HR senior, pakai template formal A. Untuk junior, pakai template casual B"

### Old: "Gak tau email kebuka atau enggak"
**New solution:**
- Open tracking pixel default
- Real-time notification saat dibuka (in-app + optional email)
- Open count per recipient (multi-open = high interest)
- Per-contact "engagement score" otomatis
