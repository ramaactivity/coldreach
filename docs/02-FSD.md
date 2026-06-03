# 02 — Functional Specification Document (FSD)

Detail tiap fitur dengan user flow, business logic, dan edge cases. Dokumen ini adalah jembatan antara PRD dan kode.

## 1. Authentication & Account Management

### 1.1 Login Flow
1. User buka aplikasi, lihat landing page singkat dengan tombol "Login dengan Google"
2. Klik tombol → redirect ke Google OAuth consent screen
3. Scope yang diminta:
   - `openid email profile` (basic identity)
   - `https://www.googleapis.com/auth/gmail.send` (send email)
   - `https://www.googleapis.com/auth/gmail.readonly` (cek reply, bounce)
   - `https://www.googleapis.com/auth/gmail.modify` (mark as read, label)
4. Setelah approve, redirect balik ke `/auth/callback`
5. Token disimpan di Supabase (encrypted), user record dibuat di tabel `users`
6. Redirect ke `/dashboard`

### 1.2 Multi-Sender Account
- User bisa nambah akun Gmail kedua/ketiga di Settings → Connected Accounts
- Setiap akun butuh re-OAuth flow
- Token tiap akun disimpan terpisah di `email_accounts` table
- Saat compose campaign, ada dropdown pilih sender account
- Active account jadi default, tapi bisa override per campaign

### 1.3 Token Refresh
- Background job tiap 50 menit refresh Gmail OAuth access token (token Google expires 1 jam)
- Kalau refresh gagal, mark account sebagai "needs reconnect"
- User kelihatan di dashboard pesan "Reconnect Gmail X"

### 1.4 Logout & Disconnect
- Logout: clear session, token tetap di DB
- Disconnect account: hapus token + revoke via Google API
- Hapus akun: cascade delete semua campaign, kontak, dll

## 2. Contact Database

### 2.1 Data Structure
Field default tiap kontak:
- `email` (required, unique per user)
- `first_name`, `last_name`
- `company`
- `position` (jabatan)
- `phone`
- `website`
- `notes` (free text)
- Custom fields (max 10 user-defined)

Metadata:
- `tags` (array of strings, multi-select)
- `source` (CSV import, manual, etc)
- `created_at`, `updated_at`
- `status` (active, unsubscribed, blocked, bounced)

### 2.2 Import Flow
1. User klik "Import Contacts" → modal upload
2. Upload CSV/XLSX (max 5MB di free tier)
3. Step 1: Parse file, tampilin 5 baris pertama
4. Step 2: Mapping kolom — drag column dari file ke field aplikasi
5. Step 3: Pilih opsi:
   - Skip duplicates (default) / Update existing / Create duplicates
   - Validasi email format (default ON)
   - Tag yang akan di-apply ke semua import (optional)
6. Step 4: Preview ringkasan: "X kontak akan di-import, Y duplikat akan di-skip, Z email invalid akan di-skip"
7. Klik "Confirm Import" → progress bar
8. Selesai: notifikasi sukses, link "View Imported Contacts"

### 2.3 Validation Rules
- Email format harus valid (regex standar)
- Hard reject: email kosong, format salah parah
- Soft warning: domain mencurigakan (cth: temp-mail.org)
- Deduplikasi: case insensitive, trim whitespace

### 2.4 Filter & Search
Filter UI di sidebar daftar kontak:
- Tags (multi-select dengan AND/OR)
- Status (active, unsubscribed, dll)
- Tanggal di-add
- Tanggal terakhir di-email
- Punya/gak punya field tertentu (contoh: "ada nomor HP")
- Custom field filter
- Search bar: cari nama, email, company

### 2.5 Bulk Actions
- Select all / select filtered
- Bulk tag (add/remove tags)
- Bulk delete (with confirmation, soft delete pertama, permanent delete via trash)
- Bulk export CSV
- Bulk add to campaign

### 2.6 Edge Cases
- File CSV dengan delimiter selain koma (semicolon, tab) → auto-detect
- File dengan encoding non-UTF8 → tampilkan error jelas
- File > 5MB → minta user split file
- Email duplikat dalam file yang sama → deduplikasi otomatis sebelum cek vs DB
- Karakter emoji di nama → harus aman, gak crash

## 3. Email Templates

### 3.1 Template Structure
- `name` (internal label)
- `subject_lines[]` (array, minimal 1, untuk A/B testing)
- `body_html` (rich text)
- `body_plain` (auto-generated dari html, atau editable manual)
- `category` (folder)
- `variables_used[]` (auto-detected: `{{nama}}`, `{{perusahaan}}`, dll)

### 3.2 Editor
- Pakai TipTap atau Lexical editor (lightweight, modern)
- Toolbar: bold, italic, underline, link, list, undo
- Variable picker: dropdown insert variable
- Preview mode dengan kontak dummy

### 3.3 Variable System
- Format: `{{field_name}}`
- Built-in vars: `{{first_name}}`, `{{last_name}}`, `{{company}}`, `{{position}}`
- Custom field vars: `{{custom_field_1}}` dst
- Fallback: kalau kontak gak punya field tsb, ganti dengan default value (set saat campaign create) atau kosong
- Smart capitalize: `{{first_name | capitalize}}` → "Andi" bukan "andi"

### 3.4 Template Library
- 5-10 template starter di seed database:
  - "Cold outreach jasa B2B (Indonesia)"
  - "Follow-up #1 setelah no reply"
  - "Follow-up #2 final touchpoint"
  - "Pengenalan produk baru"
  - "Permintaan referral"
  - dll
- User bisa duplicate dan edit

## 4. Campaign / Bulk Send

### 4.1 Campaign Wizard (4 steps)

**Step 1: Setup**
- Nama campaign (internal)
- Pilih sender Gmail account
- Pilih template (atau bikin baru)
- Subject line (kalau template ada multiple, pilih atau biarin random)

**Step 2: Audience**
- Pilih dari saved filter, atau bikin filter baru
- Atau pilih kontak manual (checkbox)
- Atau pilih tag tertentu
- Tampil count: "234 kontak akan menerima email ini"
- Auto-exclude:
  - Yang status-nya unsubscribed
  - Yang udah di-email di campaign lain dalam X hari (configurable, default 14 hari)
  - Yang status bounced

**Step 3: Schedule & Behavior**
- Send now / Schedule for later (date + time)
- Spread send across: dropdown (1 jam, 3 jam, 6 jam, sehari)
- Daily quota: max email/hari (default sesuai sender account, max 30 untuk free Gmail)
- Random delay: 30-90 detik antar email (configurable advanced)
- Skip weekend (toggle)
- Send window: jam berapa - jam berapa (default 09:00-17:00 WIB)

**Step 4: Follow-up Rules (optional)**
- Toggle "Setup follow-up sequence?"
- Kalau ya:
  - Follow-up #1: kirim template X kalau belum balas dalam Y hari
  - Follow-up #2: kirim template Z kalau belum balas dalam W hari setelah FU#1
  - Max 3 follow-up
- Stop conditions: balas, unsubscribe, bounce

**Step 5: Review & Confirm**
- Preview email pertama, kedua, ketiga (random pick)
- Show estimasi waktu selesai (berdasarkan jumlah kontak + delay + send window)
- Warning kalau ada yang aneh (cth: > daily quota Gmail)
- Tombol "Start Campaign"

### 4.2 Campaign Execution Logic

Saat campaign mulai, sistem:
1. Bikin record di `campaigns` table
2. Bikin record di `campaign_recipients` per kontak (status: pending)
3. Schedule task pertama via Supabase pg_cron atau queue
4. Loop per kontak:
   - Cek quota Gmail hari ini (via Gmail API)
   - Kalau quota habis, pause sampai besok
   - Render template dengan data kontak (variable substitution)
   - Add tracking pixel (1x1 invisible image dari /api/track/open/[tracking_id])
   - Kirim via Gmail API
   - Update `campaign_recipients` status: sent, simpan `gmail_message_id` dan `gmail_thread_id`
   - Tunggu random 30-90 detik
   - Lanjut ke kontak berikutnya
5. Selesai: kirim notifikasi ke user

### 4.3 Pause & Resume
- User bisa pause campaign yang lagi jalan
- Status pending tetap pending, gak dikirim
- Resume: lanjut dari kontak terakhir

### 4.4 Edge Cases
- User tutup browser saat campaign jalan → tetep jalan di server (Supabase Edge Function)
- Gmail account kena rate limit → exponential backoff, retry 3x, kalau gagal mark sebagai failed
- Token expired di tengah-tengah → auto-refresh, kalau gagal pause campaign
- Kontak email invalid (gak ke-cek di import) → mark sebagai bounced
- Internet user mati saat trigger campaign → ya tetep jalan, karena udah di-trigger di server

## 5. Status Tracking

### 5.1 Status Lifecycle Per Kontak
```
pending → sending → sent → delivered → opened → replied
                                    ↘ bounced
                                    ↘ unsubscribed
```

### 5.2 Open Tracking
- Setiap email yang dikirim include image: `<img src="https://app.example.com/api/track/open/{tracking_id}" width="1" height="1" />`
- Saat dibuka, server log event, update status ke "opened"
- Limitasi: Gmail cache image, jadi multiple open kadang cuma terhitung 1x. Apple Mail prefetch image (false positive). Tapi ini standar industri, kita terima.

### 5.3 Reply Detection
- Background job tiap 15 menit:
  - Untuk tiap campaign aktif, ambil semua `campaign_recipients` yang status sent/opened
  - Pakai Gmail API `users.threads.get` dengan thread_id
  - Cek apakah ada message dari email kontak (bukan dari user)
  - Kalau ada → status: replied
- Stop sequence follow-up otomatis

### 5.4 Bounce Detection
- Background job sama:
  - Cek inbox label `INBOX` untuk pesan dari `mailer-daemon@googlemail.com`
  - Parse failed delivery, ekstrak email penerima
  - Update kontak status: bounced
  - Mark campaign_recipients: bounced

### 5.5 Unsubscribe
- Setiap email punya footer dengan link unsubscribe: `https://app.example.com/unsubscribe/{token}`
- Token unik per kontak, bukan ID langsung (security)
- Klik link → halaman konfirmasi → update kontak status: unsubscribed
- Auto-exclude dari semua campaign masa depan

## 6. Follow-up Sequences

### 6.1 Logic
Setiap campaign punya sequence rules. Background job tiap jam:
- Loop semua `campaign_recipients` di campaign yang punya FU rules
- Untuk yang status "sent" atau "opened", cek waktu sejak terakhir dikirim
- Kalau melewati threshold rule (cth: 3 hari) DAN belum di-FU sebelumnya:
  - Render FU template
  - Kirim ke kontak
  - Update record `followup_history`
  - Reply tracking tetap berjalan

### 6.2 Stop Conditions
- Kontak balas
- Kontak unsubscribe
- Kontak bounce
- Max FU tercapai

## 7. Dashboard

### 7.1 Top Cards (4 KPI)
- Email dikirim hari ini (vs kemarin, %)
- Open rate 30 hari terakhir
- Reply rate 30 hari terakhir
- Quota tersisa hari ini

### 7.2 Charts
- Line chart: emails sent per day, 30 hari
- Bar chart: top 5 templates by reply rate
- Pie chart: status distribution semua kontak

### 7.3 Recent Activity
Feed real-time:
- "John Doe membuka email dari campaign 'Outreach EO Q2'" — 5 menit lalu
- "Email ke jane@company.com bounced" — 12 menit lalu
- "Campaign 'Follow-up Catering' selesai" — 1 jam lalu

### 7.4 Health Status
Indikator sehat/warning/danger:
- Bounce rate (target < 5%)
- Spam complaint (target 0)
- Sender reputation score (estimated)
- Gmail account health

## 8. Anti-Spam & Reputation Protection

Lihat dokumen 08-Anti-Spam-Strategy.md untuk detail.

Built-in checks sebelum kirim:
- Subject line spam score (cek kata-kata trigger)
- Body length (terlalu pendek/panjang flag warning)
- Link count (> 3 link = warning)
- Gambar berat (> 1MB warning)
- Capslock berlebihan
- Excessive punctuation (!!!, ???)

## 9. Settings Page

### 9.1 Profile
- Nama, email, foto profil
- Default sender signature

### 9.2 Connected Accounts
- List Gmail accounts terhubung
- Add/remove/reconnect

### 9.3 Sending Defaults
- Default daily quota
- Default delay antar email
- Default send window
- Default skip weekend

### 9.4 Custom Fields
- Manage custom fields untuk kontak
- Add/edit/delete (dengan warning kalau dipake banyak kontak)

### 9.5 Tags
- Manage daftar tag
- Color coding
- Bulk rename

### 9.6 Unsubscribe Page
- Edit halaman unsubscribe (text + branding)

### 9.7 Privacy & Data
- Export semua data (CSV)
- Delete akun (cascade hapus semua)

## 10. Notifications

In-app notifications (toast + notification panel):
- Campaign selesai
- Token Gmail expired/butuh reconnect
- Bounce rate tinggi (warning)
- Quota hari ini hampir habis
- Reply baru dari kontak

Optional: email notification ke user (1 digest harian)

## 11. Mobile Responsiveness

Aplikasi web responsive, tapi prioritas desktop. Mobile bisa:
- Lihat dashboard
- Lihat campaign status
- Reply notification
- Pause campaign

Mobile gak optimal untuk:
- Bikin template (editor susah di mobile)
- Import CSV
- Filter kontak kompleks
