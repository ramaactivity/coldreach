# 01 — Product Requirements Document (PRD)

## 1. Visi Produk

ColdReach adalah aplikasi web untuk membantu sales dan marketer Indonesia menjalankan kampanye cold email lewat akun Gmail mereka sendiri, tanpa biaya bulanan, dengan manajemen kontak yang terstruktur dan strategi anti-spam built-in.

## 2. Problem Statement

Cara existing yang user pakai (Google Apps Script + Google Sheet + Gmail draft) punya masalah konkret:

### Operational pain points
1. Bolak-balik 3 tools (Sheet, Gmail, Drive) — context switching mahal
2. Database tersebar di multiple sheet (BOGOR, JABODETABEK, COMPANY, dll) — susah cross-reference
3. Workflow copy-paste manual: master sheet → active sheet → run script → hapus dari active
4. Update status manual setelah kirim (Email Sent, Di Bales)
5. Limit 100/hari Gmail mempersempit campaign besar harus dibagi multi-hari

### Visibility gaps
6. Gak tau email kebuka apa enggak (no open tracking)
7. Gak tau kalau ada reply kecuali manual cek inbox
8. Gak ada reminder follow-up untuk yang udah open tapi belum balas
9. Susah cari riwayat: "pernah kirim ke X kapan? template apa?"

### Data integrity issues
10. Formula di Sheet rapuh, sering #REF! errors saat data dimanipulasi
11. Catatan per kontak hilang/rusak karena formula dependency
12. Gak ada constraint unique email — duplicate possible
13. Status tracking manual rentan inkonsistensi

### Strategic limitations
14. Gak bisa segmentasi cross-region (cth: "HR di Bogor + Jakarta yang udah replied")
15. Gak ada automated follow-up sequences
16. Gak ada A/B testing untuk subject line atau template
17. Single inbox, gak bisa rotasi multi-account
18. "Next Action" formula-based fragile, gak scalable

### Behavior limitations
19. Gak ada anti-spam protection: random delay, send window, daily quota guard
20. Pemakaian agresif bisa trigger Gmail block dengan zero warning
21. Gak ada email warmup buat akun baru

## 3. Target User

**Primary persona (founding user): "Sales/Marketing Catering Profesional"**

Profil konkret berdasarkan founding user (Tiska Catering, Bogor):
- Sales/marketer di bisnis F&B (catering corporate)
- Target audience: HR / Talent Acquisition / General Affair di perusahaan menengah-besar
- Database 1,000-5,000 kontak HR/GA, segmented by region (Bogor, Jabodetabek, Jakarta)
- Workflow existing: Google Sheet + Apps Script + Gmail draft
- Volume outreach 30-100 email/hari
- Pikirannya pipeline-oriented: prospek → email sent → di balas → di gali terus → closing
- Kontak segmen by region (sheet terpisah Bogor, Jabodetabek, Company)
- Konteks event-driven: outreach ramai saat ada event seasonal (Hari Raya, year-end, Open House)
- Skill: business-savvy, gak coding, tapi paham logika dan struktur data

**Secondary persona: "Solo Sales Hustler" (B2B umum)**
- Usia 25-40 tahun
- Sales B2B atau marketer di startup, agensi, jasa, atau bisnis personal
- Punya database calon klien 500-5000 kontak (excel, CSV, atau scraped)
- Pakai 1-3 akun Gmail untuk outreach
- Budget tools mendekati nol
- Skill teknis terbatas, tapi familiar dengan dashboard SaaS modern
- Volume pengiriman 30-150 email/hari

**Tertiary persona: "Side Hustler / Freelancer"**
- Konsultan, agensi kecil, freelancer yang aktif outbound
- Volume lebih kecil, 10-50 email/hari
- Lebih mementingkan kualitas personalisasi daripada volume

## 4. Solution Overview

Aplikasi web single-tenant (multi-tenant ready) yang:

- Connect ke Gmail user via OAuth (gak nyimpen password)
- Kirim email pakai Gmail API user sendiri (limit Gmail user, bukan limit aplikasi)
- Punya database kontak yang bisa di-import, segmentasi, dan filter
- Punya sistem template dengan variable (nama, perusahaan, dll)
- Kasih jeda otomatis antar email biar mimic human behavior
- Track status: terkirim, dibuka, dibalas, bounce, unsubscribe
- Punya follow-up scheduler kalau belum dibales dalam X hari
- Dashboard analytics buat ngeliat performance

## 5. Core Features (MVP — Phase 1)

### 5.0 Multi-Workspace Foundation ⭐ CORE
- Satu user account bisa mengelola multiple workspace (max 5)
- Setiap workspace = satu konteks bisnis dengan identitas terpisah
- Database kontak shared antar workspace (di user level)
- Templates, campaigns, pipeline TERPISAH per workspace
- Workspace switcher UI yang seamless
- 1 workspace memiliki 1 email account (Gmail) yang dedikasikan
- Cross-workspace anti-flood protection
- Per-workspace branding (logo, signature, attachments)
- Per-workspace pipeline definition

Lihat docs/12-Multi-Workspace-Architecture.md untuk detail.

### 5.1 Account & Email Management
- Login dengan Google OAuth
- Connect 1-3 Gmail account untuk pengiriman
- Switch active sender account dengan satu klik
- Auto-detect Gmail send quota tersisa hari ini

### 5.2 Contact Database (CRUD lengkap)
- Import kontak dari CSV/Excel dengan kolom mapping
- Manual add/edit/delete kontak
- Custom fields: nama, email, perusahaan, jabatan, jenis usaha, bidang, kota, dst
- Tags multi-select untuk kategorisasi (cth: "WO Bogor", "EO Jakarta", "Catering")
- Filter dan search canggih
- Bulk actions: tag, hapus, export, kirim
- Import wizard dengan validasi email format dan deteksi duplikat
- Export filtered contacts ke CSV

### 5.3 Email Templates
- Template builder dengan rich text editor
- Variable insertion: `{{nama}}`, `{{perusahaan}}`, `{{jabatan}}`, dst
- Subject line variations (untuk A/B testing simpel)
- Template categories/folders
- Preview dengan data dummy
- Save dan duplicate template
- Library template starter untuk berbagai industri

### 5.4 Campaign / Bulk Send
- Pilih template + pilih segmen kontak (filter)
- Preview email per kontak sebelum kirim
- Schedule: kirim sekarang, atau di waktu tertentu
- Spread send across X hours (gak blast sekaligus)
- Random delay antar email (30-90 detik) untuk anti-spam
- Pause/resume campaign
- Daily quota guardrail (default 30/hari, configurable)

### 5.5 Status Tracking
- Status per kontak per campaign: pending, sent, delivered, opened, replied, bounced, unsubscribed
- Open tracking via 1x1 pixel image
- Reply detection via Gmail API (cek thread reply)
- Bounce detection via Gmail API
- Manual override status jika perlu

### 5.6 Follow-up Sequences
- Set rule: "kalau belum balas dalam X hari, kirim follow-up template Y"
- Sampai 3 follow-up per kontak per kampanye
- Auto-stop kalau dia balas atau unsubscribe

### 5.7 Dashboard
- Total dikirim hari ini / minggu ini / bulan ini
- Open rate, reply rate, bounce rate
- Quota Gmail tersisa
- Recent activity feed
- Top performing template
- Funnel: sent → delivered → opened → replied

## 6. Phase 2 Features (Post-MVP)

- AI personalization (per-contact custom intro line via Claude API user)
- A/B test subject lines dengan auto-pick winner
- Email warm-up basic (kirim balas ke akun lain dalam ekosistem)
- Unsubscribe link auto-generated
- Domain health checker (cek SPF, DKIM, DMARC)
- Webhook integrasi (Zapier, Make.com)
- Multi-user / team accounts

## 7. Phase 3 Features (Long Term)

- WhatsApp integration via WhatsApp Cloud API
- LinkedIn integration
- AI-generated reply suggestions
- CRM mini built-in
- Mobile app

## 8. Out of Scope (Forever)

- Email finder / lead database
- Built-in lead scraping
- Anything that violates Gmail TOS atau UU PDP Indonesia

## 9. Success Metrics

### Adoption metrics
- User bisa setup dan kirim campaign pertama dalam < 15 menit
- Daily active usage minimal 5 hari per minggu

### Quality metrics
- Open rate user > 30% (industry avg ~20-25%)
- Bounce rate user < 5%
- Spam complaint rate < 0.3% (Gmail's threshold)
- Zero akun Gmail user yang ke-banned karena pemakaian aplikasi

### Technical metrics
- 99% email delivery success (no internal error)
- Page load < 2 detik
- Free tier infrastructure tetap cukup sampai 5 user concurrent

## 10. Constraints & Assumptions

### Constraints
- Budget infrastruktur: Rp 0 (semua free tier)
- User pakai @gmail.com (bukan domain bisnis), jadi safe limit 30-50/hari
- Supabase free tier auto-pause setelah 7 hari inaktif
- Vercel serverless function timeout 10 detik di Hobby
- Gmail API quota: 1 milyar units/hari (cukup banget) tapi limit pengiriman Gmail itu sendiri yang ketat

### Assumptions
- User udah punya database kontak (CSV/Excel) — kita gak bikin lead finder
- User paham basic cold email etiquette (gak spam, ada value, ada CTA jelas)
- User mau follow recommended best practices dari aplikasi
- User akses aplikasi minimal seminggu sekali (biar Supabase project gak pause)

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Akun Gmail user di-banned karena spam | Kritis | Built-in rate limiting, peringatan jika pengiriman terlalu agresif, edukasi via UI |
| Database Supabase mencapai limit 500MB | Sedang | Struktur data efisien, paginasi, archive feature untuk data lama |
| Vercel function timeout saat blast | Sedang | Pengiriman dipindah ke Supabase Edge Function dengan queue pattern |
| Gmail API rate limit hit | Sedang | Exponential backoff retry, dispersi ke multiple accounts |
| User import data kotor/duplikat | Rendah | Validasi import, deteksi duplikat, sanitasi email |
| Project Supabase pause karena inaktif | Sedang | Cron ping mingguan via cron-job.org gratis |

## 12. Compliance & Legal

### UU PDP (Perlindungan Data Pribadi) Indonesia
- Aplikasi harus punya halaman Privacy Policy
- Setiap email cold harus ada opt-out/unsubscribe link
- User wajib punya legitimate interest atau consent untuk kontak email yang di-import
- Aplikasi gak boleh provide lead scraping bawaan

### Gmail Terms of Service
- Gak boleh otomatisasi yang melanggar TOS Gmail
- Gak boleh bypass rate limit Gmail
- Aplikasi pakai Gmail API resmi via OAuth, bukan SMTP scraping

### CAN-SPAM (untuk recipient di luar Indonesia)
- Jelas siapa pengirim
- Subject line gak menyesatkan
- Alamat fisik pengirim disertakan
- Mekanisme unsubscribe yang berfungsi
