# 10 — Migration Plan dari Sistem Lama (Google Sheet + Apps Script)

Dokumen ini bridge antara workflow existing user dan app baru. Tujuan: transisi smooth, gak ada data hilang, kebiasaan kerja yang baik di-preserve, yang buruk diperbaiki.

## 1. Analisis Workflow Existing

### Yang user lakukan saat ini:

**Setup:**
- 2 Google Sheet utama: "Tiska mail merge" (active sheet) dan "DATABASE TRACKING LEADS TISKA 2025" (master database)
- Master database punya multi-sheet by region: MARKET TISKA, BOGOR, JABODETABEK, COMPANY, LIST FOLLOWUP
- Apps Script "Mail Merge" dengan menu custom

**Per kampanye:**
1. Buka master database, filter yang mau dikirim
2. Copy ke Sheet "Tiska mail merge" (atau Sheet1)
3. Buka Gmail, edit draft template
4. Run script: Extension → Mail Merge → Send Emails
5. Input subject line di prompt
6. Tunggu 100 email kekirim (limit Gmail free)
7. Kembali ke master, update status manual (Email Sent / Di Bales)
8. Hapus row dari active sheet
9. Catat di "Catatan" kalau ada info follow-up
10. Sheet LIST FOLLOWUP buat track yang perlu di-FU

### Pain points yang teridentifikasi:

| Pain | Severity | Cause |
|------|----------|-------|
| Bolak-balik 3 tools (Sheet, Gmail, Drive) | High | Tools terpisah |
| Copy-paste manual database antar sheet | High | Workflow inheritance |
| Hapus manual row yang udah dikirim | High | Gak ada deduplication otomatis |
| Limit 100/hari Gmail | Medium | Gmail free constraint |
| Formula #REF! sering rusak | Medium | Sheet fragility |
| Catatan field hilang/rusak | Medium | Cell reference issue |
| Gak tau email kebuka apa enggak | High | Apps Script gak track open |
| Gak ada notifikasi reply | High | Manual cek inbox |
| Multi-sheet by region susah cross-reference | Medium | Data fragmentation |
| Status update manual after kirim | Medium | No automation |
| Susah cari riwayat: pernah kirim ke X kapan? | Medium | No search across sheets |

### Yang udah baik dan harus di-preserve:

| Strength | Implementation di App Baru |
|----------|----------------------------|
| Mindset pipeline (Prospek → Email Sent → Di Bales) | Status field di campaign_recipients dengan lifecycle yang sama |
| Segmentasi by region (Bogor, Jabodetabek, Company) | Tag system multi-select |
| "Next Action" auto-trigger | Follow-up rules + smart suggestions |
| Color coding status | Status badge dengan warna konsisten (lihat UI Design System) |
| Catatan per kontak | Notes field di contacts table |
| Multi-tab segmentation | Saved filters, bukan sheet terpisah |

## 2. Database Migration Strategy

### 2.1 Mapping Field Sheet Lama → Schema Baru

Dari screenshot, field yang ada di sheet lama:

| Sheet Lama Field | App Baru Field | Notes |
|------------------|----------------|-------|
| No (nomor urut) | (auto, gak perlu di-import) | UUID lebih reliable |
| First Name | `first_name` | Direct mapping |
| Last Name | `last_name` | Direct mapping |
| Email / Recipient | `email` | Direct mapping (UNIQUE constraint) |
| Perusahaan / Company | `company` | Direct mapping |
| Posisi / Title | `position` | Direct mapping |
| Jenis (Prospek) | `tags[]` → "prospek" | Tag, karena ini kategori |
| Status (Email Sent, Di Bales) | (derived dari campaign_recipients status) | Gak disimpan di contacts, tapi di-compute |
| Catatan | `notes` | Direct mapping |
| Next Action | (computed via follow-up rules) | Auto-suggested di UI |

### 2.2 Field Tambahan untuk Catering Business Context

Berdasarkan use case Tiska Catering (catering corporate via HR):

Custom fields yang harus ada (atau bisa user buat sendiri):

| Field | Type | Purpose |
|-------|------|---------|
| `region` | text | Bogor, Jabodetabek, Jakarta, dll — replace sheet segmentation |
| `industry` | text | F&B, Tech, Banking, dll |
| `company_size` | select | Small, Medium, Large |
| `event_type_interest` | text | "Open House", "Annual Meeting", "Daily Catering" |
| `linkedin_url` | url | Source data |
| `last_contacted_via` | select | "Email", "WhatsApp", "Phone" |

User bisa buat custom field sendiri sesuai kebutuhan.

### 2.3 Tag Suggestions untuk Migration

Saat first-time setup, suggest user untuk import dengan tags:

Region tags:
- `bogor` (dari sheet BOGOR)
- `jabodetabek` (dari sheet JABODETABEK)
- `jakarta`, `bandung`, `surabaya`

Status tags (legacy, opsional):
- `prospek`
- `replied-to`
- `client`
- `cold-contact`

Industry tags:
- `hr-talent-acquisition`
- `general-affair`
- `procurement`
- `office-management`

User bisa create lebih lanjut.

## 3. Migration Wizard di App

Saat user pertama kali login, tampilkan wizard "Pindah dari Google Sheet?":

### Step 1: Welcome
"Hai! Kami lihat ini pertama kalinya. Apakah Anda ingin import database dari Google Sheet/CSV existing?"
- [Yes, Import Now] → lanjut step 2
- [Skip, Start Fresh] → ke dashboard

### Step 2: Format Selection
"Bagaimana format database Anda?"
- [ ] Single sheet (1 file CSV/XLSX)
- [ ] Multiple sheets (kayak Tiska database punya BOGOR, JABODETABEK, dll)
- [ ] Belum punya, mau bikin manual

Kalau "Multiple sheets" dipilih:
"Setiap sheet akan jadi tag region. Misal sheet 'BOGOR' jadi tag 'bogor'."

### Step 3: Upload
- Drag-drop file
- Atau paste link Google Sheet (dengan instruksi share publik)
- Parse client-side dulu, tampilkan preview

### Step 4: Auto-Detect Mapping
Sistem auto-detect kolom dengan fuzzy matching:
- "First name", "Nama", "Nama Depan" → first_name
- "Email", "Recipient", "Email Address" → email
- "Company", "Perusahaan", "PT" → company
- "Position", "Jabatan", "Title" → position
- "Notes", "Catatan", "Komentar" → notes
- "Status" → suggest as tag atau skip
- "Catatan" / unrecognized → custom field atau skip

User confirm/adjust mapping.

### Step 5: Smart Suggestions
"Berdasarkan data yang kami baca, kami menyarankan:"
- Auto-create tags: bogor (450 contacts), jabodetabek (300 contacts), jakarta (120 contacts)
- Auto-create custom field: "industry" (terdeteksi 12 unique values)
- Skip kolom "No" karena auto-handled

[Apply Suggestions] / [Customize]

### Step 6: Status Migration
"Kami lihat sebagian kontak punya status 'Email Sent' dan 'Di Bales'. Apa yang ingin Anda lakukan?"

Options:
- [ ] Buat campaign retroaktif "Migration - Past Outreach" dengan status appropriate
- [ ] Tambahkan sebagai tag untuk reference (mudah di-filter nanti)
- [ ] Skip status, mulai fresh

Recommended: Tag-based, supaya bisa filter "yang udah pernah di-email tapi gak balas" untuk re-engagement campaign.

### Step 7: Review & Import
- Summary: "Akan import 1,234 kontak dengan 8 tags dan 3 custom fields"
- "X duplicate akan di-skip"
- "Y email invalid akan di-skip"
- [Confirm Import]

### Step 8: Done
- Success page: "1,189 kontak berhasil di-import!"
- Suggested next actions:
  - "Buat template email pertama"
  - "Connect Gmail account"
  - "Buat campaign pertama dengan filter `region:bogor`"

## 4. Template Migration

### Source: Gmail Drafts
User mungkin udah punya beberapa Gmail draft yang dipakai sebagai template (karena Apps Script lama match by subject line).

Wizard "Import dari Gmail Drafts":
1. List semua draft user
2. User pilih yang mau di-import (multi-select)
3. App fetch via Gmail API, parse subject + body
4. Detect existing variables (`{{firstname}}`, `{{nama}}`, dll) dan convert ke format baru
5. Save sebagai template di database
6. User bisa edit/refine setelahnya

Logic conversion variable:
- `{{firstname}}` → `{{first_name}}`
- `{{Nama}}` → `{{first_name}}` (case-insensitive matching)
- `{{Company}}` → `{{company}}`
- `{{Position}}` → `{{position}}`
- Custom unknown → tetap, user fix manual

## 5. Workflow Comparison: Old vs New

### Old: Kirim 100 email harian

```
1. Buka master database (5 sheet) — 30 detik
2. Filter yang mau dikirim — 1 menit
3. Copy 100 row — 30 detik
4. Buka active sheet — 15 detik
5. Paste — 15 detik
6. Buka Gmail, cek/edit draft — 2 menit
7. Tutup Gmail, balik Sheet — 15 detik
8. Run script → input subject — 30 detik
9. Tunggu 100 email kekirim — 5-10 menit
10. Cek hasil, scroll cek error — 1 menit
11. Balik master, update status manual — 5 menit
12. Hapus row dari active — 30 detik
TOTAL: ~ 16-21 menit per kampanye
```

### New: Kirim 100 email harian

```
1. Buka app, dashboard — 5 detik
2. New Campaign → pilih saved filter "Bogor HR" — 10 detik
3. Pilih template "Cold Outreach Catering" — 5 detik
4. Konfirm send schedule (default udah set) — 5 detik
5. Klik "Start Campaign" — 1 detik
6. Tutup browser, lanjut kerjaan lain
7. Selesai (otomatis di background, status update otomatis)
TOTAL: ~ 30 detik aktif, plus background processing
```

**Time saved: ~ 95% reduction in manual work**

Plus benefit:
- Auto-track open dan reply
- Auto follow-up untuk yang belum balas
- Gak perlu manual update status
- History searchable
- Multi-account rotation (kalau ada > 1 Gmail)

## 6. Workflow Pattern Migration

### "Daily Send Routine" — kebiasaan baru
Pagi, user buka app:
1. Liat dashboard: "Quota tersisa hari ini: 30/30"
2. Liat suggested action: "5 contact perlu follow-up #1"
3. Klik [Run Auto Follow-ups] → otomatis schedule
4. New Campaign untuk fresh outreach kalau ada
5. Tutup, lanjut kerja

Sore/malam:
1. Liat dashboard: "Hari ini 28 sent, 2 opened, 0 replied"
2. Cek inbox notifications: ada reply dari X
3. Reply manual via Gmail (tetep pake Gmail untuk percakapan)

### "Weekly Review" — kebiasaan baru
Senin pagi:
1. Filter: contacts yang opened tapi belum reply (3+ hari)
2. Bulk action: tag `warm-lead`
3. Schedule custom outreach untuk warm leads
4. Review template performance, optimasi

Friday afternoon:
1. Export weekly report (sent, opened, replied, conversion)
2. Liat top performing template, plan template baru untuk minggu depan

### "Master Database Maintenance" — kebiasaan baru
Bulanan:
1. Filter: contacts inactive (gak pernah opened/replied dalam 90 hari)
2. Move ke "cold storage" tag, exclude dari blast utama
3. Re-engagement campaign khusus untuk cold list

## 7. Mental Model Shift

### Old mental model:
"Database adalah daftar yang harus dikelola secara manual. Email adalah aksi terpisah yang dilakukan via Gmail. Tracking adalah tugas tambahan setelah kirim."

### New mental model:
"Database adalah single source of truth yang otomatis update statusnya berdasarkan aksi. Email adalah otomasi yang dipicu dari database. Tracking inheren, tidak perlu effort tambahan."

Aplikasi harus mengajak user ke mental model baru, bukan replicate yang lama.

## 8. Backup & Rollback Plan

Selama 30 hari pertama setelah migration:
- User TETAP keep Google Sheet existing (jangan dihapus)
- App jalan paralel
- Kalau ada masalah serius, fallback ke Sheet
- Setelah 30 hari nyaman, user bisa archive Sheet

## 9. Edge Cases dari Sheet Lama

### Duplicate emails
Kemungkinan ada di multiple sheet (cth: kontak yang sama di BOGOR dan JABODETABEK karena salah klasifikasi).

Handle:
- Detect saat import
- Show preview: "Email X muncul 3x di file"
- Default: keep first occurrence, merge tags dari semua
- User bisa override

### #REF! errors
Pasti ada cells dengan #REF! dari formula broken.

Handle:
- Saat parse, treat #REF! sebagai empty
- Skip warning di import report

### Empty rows
Sheet biasanya ada baris kosong di tengah/bawah.

Handle:
- Auto-skip rows yang gak punya email

### Inconsistent data
Cth: "Bogor" vs "BOGOR" vs "bogor" vs "Kab. Bogor"

Handle:
- Normalisasi otomatis ke lowercase
- Suggest merge: "Detected similar tags: 'bogor' (450), 'BOGOR' (12), 'Kab. Bogor' (3). Merge?"

### Phone numbers
Kalau di sheet lama ada nomor HP, format Indonesia bervariasi (+62, 0, dll).

Handle:
- Import as-is ke `phone` field
- Optional normalize ke +62 format

## 10. Success Criteria Migration

User dianggap "successfully migrated" kalau:
- [ ] Semua kontak relevan dari Sheet ada di app
- [ ] Tags dan segmentation work seperti expected
- [ ] Bisa kirim campaign pertama dengan benar dalam 30 menit setelah login
- [ ] Sentiment positif (gak frustrated)
- [ ] Setelah 1 minggu, gak balik buka Sheet untuk kerja outreach

Track via:
- In-app analytics: "import success", "first campaign sent", "second week active"
- Optional in-app survey setelah 7 hari

## 11. Specific Adaptations untuk Tiska Catering

Karena gua tau use case spesifik (catering Bogor target HR corporate), starter content harus relevan:

### Starter templates Indonesian-context:
1. **"Cold Outreach: Catering Corporate (HR Focus)"**
   - Subject: "Solusi catering hari ini untuk tim {{company}}"
   - Body: opening pakai pain point HR (acara internal, daily lunch), value prop catering profesional, social proof, soft CTA

2. **"Follow-up: Open House / Hari Raya Event"**
   - Subject: "Persiapan Open House {{company}} sudah?"
   - Body: tie ke event seasonal (Hari Raya, Anniversary), mention paket khusus

3. **"Re-engagement: Cold Lead"**
   - Subject: "Update: paket catering Q4 untuk {{company}}"
   - Body: kasih update, foto event recent, refresh interest

4. **"Referral Request"**
   - Subject: "Boleh saran nama tim yang handle catering?"
   - Body: kalau dia bukan PIC, minta diarahkan

### Starter tags pre-loaded:
- `bogor`, `jabodetabek`, `jakarta`
- `prospek-baru`, `pernah-pesan`, `client-aktif`
- `hr`, `general-affair`, `procurement`
- `corporate`, `umkm`, `event-organizer`
- `prioritas-tinggi`, `prioritas-rendah`

User bisa hapus/tambah sesuai kebutuhan.

### Saved filter pre-loaded:
- "HR Bogor — belum pernah dikirim"
- "Yang opened tapi belum reply"
- "Replied — perlu follow-up manual"
- "Cold list — > 90 hari no contact"

Dengan saved filter ini, user bisa langsung produktif dari hari pertama.
