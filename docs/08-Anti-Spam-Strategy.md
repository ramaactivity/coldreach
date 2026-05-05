# 08 — Anti-Spam & Deliverability Strategy

Strategi konkret untuk menjaga reputation Gmail user dan minimize chance email masuk spam atau akun di-ban.

Ini dokumen paling penting untuk longevity aplikasi. Volume gak ada artinya kalau email masuk spam semua atau akun ke-ban.

## 1. The Hard Truth About Free Gmail for Cold Email

Sebelum kita bahas strategi, harus jujur dulu:

- Gmail gratis (@gmail.com) **bukan tools yang ideal** untuk cold email. Reputation @gmail.com sebagai sender domain itu di-trust untuk personal use, bukan bulk outreach.
- Gmail aktif memantau pola pengiriman. Pattern bulk dari @gmail.com kemungkinan akan kena flag.
- Industry standard untuk cold email: **25-50 email per hari per inbox** untuk Workspace dengan custom domain. Untuk @gmail.com, bahkan harus lebih konservatif.
- Akibat ketahuan: temporary block 24 jam (mild), permanent ban (severe). Permanent ban berarti akun mati selamanya.

**Tetap bisa dipakai? Ya, kalau:**
- Volume rendah (30-50/hari max)
- Email berkualitas tinggi (gak generic blast)
- Pattern pengiriman mimic human behavior
- Recipient list bersih (gak banyak bounce)
- Konten gak trigger spam filter

**Saran realistis:**
- Phase 1 pakai @gmail.com untuk validate ide produk dan kebutuhan
- Phase 2, kalau serius scaling, beli domain murah (~ Rp 150rb/tahun) + Zoho Mail gratis atau Google Workspace
- Beli domain yang DIFFERENT dari main domain bisnis lu, biar reputation main domain gak kena efek negatif kalau ada masalah

## 2. Gmail Sending Limits Reality Check

Berdasarkan research:
- **Hard limit @gmail.com:** 500 email/hari via web, 100/hari via SMTP
- **Hard limit Workspace:** 2,000 email/hari
- **Practical safe limit Workspace:** 100-150/hari per inbox
- **Practical safe limit @gmail.com:** 25-50/hari per inbox

**Default app:** 30/hari per akun. User bisa naikan tapi ada warning.

## 3. Domain Authentication (Critical Future)

Untuk @gmail.com, autentikasi sudah ditangani Google. Tapi kalau user upgrade ke custom domain:

### SPF (Sender Policy Framework)
DNS TXT record di domain:
```
v=spf1 include:_spf.google.com ~all
```

### DKIM (DomainKeys Identified Mail)
Aktifkan di Google Workspace admin, copy generated public key ke DNS TXT.

### DMARC (Domain-based Message Authentication)
DNS TXT record:
```
v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com
```
Mulai dari `p=none` (monitoring), naikin ke `p=quarantine` setelah 30 hari, akhirnya `p=reject`.

**Aplikasi harus include "Setup Wizard" untuk panduan ini di Phase 2.**

## 4. Built-in Guardrails di Aplikasi

### 4.1 Pre-Send Validation

Sebelum kirim, sistem scan dan kasih warning:

#### Subject line spam keyword check
Daftar keyword yang sering trigger spam (Bahasa + Inggris):
```
"Free", "Gratis", "Diskon", "Sale", "Hadiah", "Promo besar",
"Klik sini", "Click here", "Buy now", "Beli sekarang",
"Urgent", "URGENT!!!", "Act now", "Limited time",
"$$$", "Rp Jutaan", "Penghasilan",
"100% guaranteed", "No risk"
```

Kalau detected, warning "Subject mungkin masuk spam. Pertimbangkan ubah."

#### Body content checks
- All caps ratio > 30% → warning
- Link count > 3 → warning
- Image-only email (no text) → block, force tambah text
- Body terlalu pendek (< 30 kata) → warning, mungkin kelihatan spammy
- Body terlalu panjang (> 500 kata) → warning, cold email idealnya pendek

#### HTML cleanup
- Strip dangerous tags
- Remove tracking dari template lain (kalau user paste dari Mailchimp dll)
- Sanitize lewat DOMPurify

### 4.2 Sending Behavior

#### Random delay
Default 30-90 detik antar email. Configurable, tapi minimum 15 detik.

#### Send window
Default 09:00-17:00 WIB. Hindari kirim tengah malam (suspect timing).

#### Skip weekend
Default ON. Cold email weekend kemungkinan ignored, bouncing rate naik.

#### Daily quota guardrail
Default 30/hari per akun. Bisa diubah tapi:
- > 50/hari: warning yellow "Volume tinggi, pastikan list quality bagus"
- > 80/hari: warning red "Anda mendekati limit unsafe untuk @gmail.com"
- > 100/hari: hard block kecuali user explicit confirm "saya tau resikonya"

#### Spread over time
Kalau user pilih "kirim 30 email", default spread over 4-6 jam, bukan blast.

#### Throttle saat error
Kalau ada beberapa send error berturut-turut, auto-pause campaign dan kasih notifikasi user.

### 4.3 List Hygiene

#### Email validation di import
- Format check (regex)
- MX record check (optional, butuh API external) — Phase 2
- Disposable email detection (basic list of temp-mail providers)

#### Auto-suppress
- Status: bounced, unsubscribed, blocked → auto-exclude semua campaign masa depan
- Per-contact rate limit: gak boleh dikirim email lebih dari 1x dalam 14 hari (configurable)

#### Bounce handling
- Hard bounce (550, 553) → status bounced, never email lagi
- Soft bounce (4xx) → retry 1x setelah 1 jam, kalau gagal, mark soft-bounce

### 4.4 Content Personalization Forced

Sistem detect:
- Template tanpa variable apapun → warning "Email gak personalized, kemungkinan generic"
- > 50% recipient gak punya variable yang dipakai → warning
- "Hi there" / "Dear sir" → warning, push pakai nama

### 4.5 Unsubscribe Compliance

Setiap email otomatis include footer:
```
---
Anda menerima email ini karena [reason].
Untuk berhenti menerima email, [klik di sini](unsubscribe-link).
[Nama Pengirim] - [Email] - [Lokasi]
```

User bisa edit copy tapi link gak bisa dihilangkan.

Header email juga include `List-Unsubscribe` (RFC 8058 one-click unsubscribe).

### 4.6 Reputation Health Score

Score per Gmail account, di-display di dashboard:

```
Reputation Score: 78/100
✓ Bounce rate: 1.2% (target < 5%)
✓ Open rate: 18% (target > 15%)
⚠ Reply rate: 4% (target > 5%)
✓ No spam complaints
✓ Sending pattern healthy
```

Cara hitung (rough):
- Bounce rate < 2%: +25pt, < 5%: +15pt, > 10%: -20pt
- Open rate > 25%: +25pt, > 15%: +15pt, < 5%: -10pt
- Reply rate > 10%: +25pt, > 5%: +15pt
- No spam complaint last 30d: +15pt
- Sending consistency: +10pt

Score < 50 → red warning di dashboard, suggest pause + review list.

## 5. Pengiriman Throttling Strategy

### 5.1 New Account Warm-up
Untuk Gmail account yang baru di-connect:
- Day 1-3: max 10 email/hari
- Day 4-7: max 20 email/hari
- Day 8-14: max 30 email/hari
- Setelah 14 hari: full quota user setting

User bisa skip via "I've been using this Gmail for cold email already" toggle. Tapi default ON untuk safety.

### 5.2 Per Recipient Backoff
Kalau bounce dari domain X, suspend email lain ke domain X selama 24 jam (mungkin issue di server mereka).

### 5.3 Adaptive Throttling
Kalau dalam 1 jam ada 5+ error dari Gmail API:
- Auto-pause semua jobs untuk akun itu
- Notifikasi user
- User manual review + resume

## 6. Konten yang Cenderung Aman

Berdasarkan industry research, cold email yang punya reply rate > 10%:

### Strukturnya:
1. **Subject line:** Personal, spesifik, gak overpromise. Max 50 char. Idealnya nyebut nama atau perusahaan.
2. **Opening:** Personal hook (sebut sesuatu spesifik tentang mereka, bisa pakai variable)
3. **Value prop:** 1-2 kalimat, jelas, fokus benefit mereka
4. **Social proof:** Nama klien atau angka spesifik (optional)
5. **CTA:** SATU pertanyaan jelas, low-friction (cth: "Boleh saya jadwalkan 15 menit chat minggu depan?")
6. **Signature:** Singkat, plus link 1 (LinkedIn atau website)

### Lengthnya:
- Total body: 50-150 kata sweet spot
- Lebih dari 200 kata: open rate turun
- Kurang dari 30 kata: kelihatan spammy

### Yang DIHINDARI:
- Banyak link (max 1, atau 2 kalau plus social media)
- Gambar besar atau attachment (red flag)
- Format weird (warna macem-macem, font besar-besar)
- "REPLY ME" capslock
- Tracking link banyak (sebagian email client flag)
- Spammy footer (banyak link, terms, dll)

## 7. Library Template yang Anti-Spam

5-10 starter template yang udah optimal:

1. **Cold intro B2B (ID)** — perkenalan jasa, relevant problem, soft CTA
2. **Catering / WO Outreach (ID)** — niche untuk catering ke EO/perusahaan
3. **Follow-up #1: gentle reminder** — singkat, tanya apakah sempat baca
4. **Follow-up #2: value-add** — kasih insight gratis tanpa minta apa-apa
5. **Follow-up #3: break up** — "kalau gak relevan no problem, terima kasih"
6. **Referral request** — minta diarahkan ke orang yang tepat
7. **Re-engagement** — untuk kontak lama yang gak balas

Semua udah include: variable, personalisasi, tone yang manusiawi, length optimal.

## 8. Edukasi User Built-in

### Onboarding tour (first-time user)
Tampilin 5 slide singkat:
1. "Ini app cold email, bukan email marketing. Beda."
2. "Kualitas > kuantitas. 50 email bagus > 500 spam."
3. "Pakai variable, jangan generic blast."
4. "List quality is everything. Bersihkan daftar Anda."
5. "Sabar. Cold email butuh waktu. Reply rate 5% itu OK."

### Tooltip in-context
Di field-field krusial, ada tooltip kasih guidance.

### Health alert proaktif
Kalau pattern bahaya detected, banner di top:
- "Bounce rate Anda 8% minggu ini. Kalau terus naik, akun bisa kena suspend. Recommend: hapus email yang sering bounce."
- "Anda kirim 80 email hari ini. Ini di atas safe limit untuk @gmail.com. Pertimbangkan turunkan."

## 9. What to Do When Account Gets Blocked

Pasti ada user yang kena suspend. Aplikasi harus help recovery:

### Detection
- Saat send fail dengan 4xx specific code, mark account `health: blocked`
- Notify user immediately

### Guidance
Halaman troubleshooting:
1. Stop semua campaign
2. Tunggu 24-48 jam jangan login
3. Kalau bisa login: kirim 5-10 email manual non-spammy ke teman
4. Tunggu beberapa hari
5. Coba kirim 1-2 cold email dulu sebelum bulk
6. Pertimbangkan beli custom domain

### Tools recovery
- Export semua kontak yang BELUM dikirim
- Export campaign drafts
- User bisa connect akun Gmail lain dan resume

## 10. Compliance Reminder

### UU PDP Indonesia
Setiap kontak yang di-import, idealnya:
- Punya legitimate interest (publicly available business contact)
- Bukan dari source ilegal (scraped pribadi tanpa consent)
- Always include unsubscribe option
- Respect kalau di-unsubscribe

### Best practice
- Kontak harus punya konteks bisnis (perusahaan, jabatan, dll)
- Email konten harus bisnis-related
- Gak mass blast ke email pribadi

App display reminder text di import wizard.

## 11. Monitoring & Continuous Improvement

### Metrics yang dipantau (hidden, internal use)
- Average open rate per industri (template benchmarking)
- Send-time analysis (jam berapa best)
- Subject line patterns yang work
- Domain bounce patterns

### Future improvements
- ML-based spam score predictor
- Auto-suggest improvement template berdasarkan performance
- Inbox placement testing (pakai service eksternal)

## 12. Limit yang Hard-Coded (Gak bisa di-bypass)

Ini hardcoded di backend, gak ada UI toggle:
- Max 200 email/hari per akun (bahkan kalau user paksa)
- Min 15 detik delay antar email
- Max 1 email ke kontak yang sama dalam 24 jam (anti-mistake)
- Max 3 follow-up per kontak per kampanye
- Email body max 50KB
- Max 5,000 recipients per campaign

User bisa request adjust kalau punya custom domain dan reputation bagus, tapi default-nya konservatif.

## 13. Final Recommendation untuk User

Banner permanent di dashboard sampai user pakai custom domain:

```
💡 Tip: Untuk hasil maksimal, pertimbangkan beli domain (~ Rp 150rb/tahun)
   dan setup Google Workspace atau Zoho Mail (gratis 5 user).
   Dengan custom domain, Anda bisa:
   • Kirim 100+ email/hari aman
   • Reputation domain sendiri (gak share dengan @gmail.com lain)
   • Lebih profesional di mata recipient
   [Pelajari lebih lanjut →]
```

Link ke artikel internal dengan step-by-step guide setup domain + Workspace.
