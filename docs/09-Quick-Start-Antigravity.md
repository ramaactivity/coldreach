# 09 — Quick Start: Vibe Coding di Antigravity

Panduan praktis untuk mulai eksekusi project ini dengan Claude di IDE Antigravity.

## Sebelum Mulai

Pastikan udah:
1. ✅ Bikin akun GitHub
2. ✅ Bikin akun Vercel (login dengan GitHub)
3. ✅ Bikin akun Supabase
4. ✅ Bikin Google Cloud Project untuk OAuth
5. ✅ Antigravity IDE udah terinstall dengan Claude extension

## Step 1: Setup Workspace di Antigravity

1. Buka Antigravity
2. Buat folder baru: `cold-reach`
3. Inside folder itu, bikin folder `docs`
4. Copy SEMUA file dari folder docs (00-09) ke `cold-reach/docs/`
5. Open folder di Antigravity sebagai workspace

## Step 2: Initial Prompt to Claude

Copy prompt ini persis, paste ke Claude di Antigravity:

```
Halo Claude. Gua mau bangun aplikasi cold email automation pakai vibe coding.

Konteks:
- Gua sales/marketing, gak punya skill coding, tapi punya logic bagus
- Project pakai 100% free tier (Next.js + Vercel + Supabase + Gmail API)
- Semua spec udah ada di folder docs/

Tugas pertama lu:
1. Baca semua file di folder docs/ secara berurutan dari 00-README.md
2. Setelah baca, buat ringkasan 1 paragraf: apa yang akan kita bangun, dengan stack apa, dan tahapan eksekusinya berapa fase
3. Tampilin tabel kasar berapa estimasi total waktu yang dibutuhkan untuk MVP
4. Tanya gua: ada bagian dari spec yang lu rasa kurang jelas atau perlu diadjust?

Jangan mulai coding sebelum gua approve. Cukup baca dan rangkum dulu.
```

## Step 3: Setelah Claude Rangkum, Diskusi

Claude akan bertanya klarifikasi. Jawab dengan jujur dan spesifik. Contoh:
- Kalau Claude tanya soal preferensi UI: tunjuk ke `05-UI-Design-System.md`
- Kalau Claude tanya soal urutan: tunjuk ke `07-Implementation-Roadmap.md`
- Kalau Claude tanya soal limit: tunjuk ke `08-Anti-Spam-Strategy.md`

## Step 4: Mulai Eksekusi Per Fase

Setelah diskusi, mulai dari **Phase 0** dengan prompt:

```
Oke, sekarang kita mulai eksekusi Phase 0 dari docs/07-Implementation-Roadmap.md.

Plan dulu:
1. Step pertama yang harus gua kerjain manual (bikin akun, dst)
2. Step yang lu bisa kerjain (init project, install dependencies, dst)
3. Order eksekusinya gimana

Setelah plan, kita eksekusi step by step. Kalau ada yang harus gua input
secara manual (kayak API keys), beritahu gua dengan jelas apa yang harus
di-copy dari mana.
```

Approve plan, biarin Claude eksekusi.

## Step 5: Pattern untuk Tiap Fase

Untuk setiap fase Phase 1, 2, 3, dst, gunakan pattern ini:

```
Phase X selesai. Status:
✅ [test 1 pass]
✅ [test 2 pass]
✅ [test 3 pass]

Sekarang mulai Phase X+1 dari docs/07-Implementation-Roadmap.md.

Sebelum mulai, lu re-read bagian Phase X+1 di roadmap, plus dokumen
relevan yang dirujuk (misalnya kalau Phase 3 lu re-read bagian 4-Database-Schema 
untuk tabel contacts, dan 02-FSD bagian 2 untuk Contact Management).

Kasih gua plan detail dulu. Setelah gua approve, baru mulai coding.
```

## Step 6: Saat Stuck atau Error

Pattern minta Claude debug:

```
Gua dapat error ini: [paste error]

Tolong:
1. Jelasin penyebab error dalam bahasa awam
2. Kasih 2-3 kemungkinan solusi
3. Tunjuk yang paling probable
4. Implementasi solusi setelah gua approve

Kalau lu butuh info tambahan dari gua (cth: isi file, env var, dll),
tanya dulu sebelum nebak.
```

## Step 7: Saat Mau Skip atau Modify Spec

Pattern minta Claude adjust dari spec:

```
Gua mau ubah dari spec aslinya:
- Original: [yang ada di docs]
- Diubah ke: [yang gua mau]
- Alasan: [kenapa]

Implikasi yang lu liat dari perubahan ini apa? Apakah ada dokumen lain
yang perlu di-update? Setelah lu jelasin, baru kita putuskan jalan.
```

## Step 8: Saat Mau Tambah Fitur Baru

Pattern proper:

```
Gua mau tambah fitur baru: [deskripsi fitur]

Sebelum coding:
1. Update PRD (docs/01-PRD.md) dengan fitur ini di section yang tepat
2. Update FSD (docs/02-FSD.md) dengan detail flow
3. Update database schema kalau perlu (docs/04-Database-Schema.md)
4. Update roadmap kalau ini fitur major

Setelah dokumen update, baru kita coding. Show me the doc updates first.
```

## Tips Vibe Coding Efektif

### Do's
- ✅ Selalu re-read dokumen yang relevan sebelum mulai fase baru
- ✅ Test manual setelah tiap fitur selesai sebelum lanjut
- ✅ Commit ke Git sering (per fitur kecil)
- ✅ Backup database export weekly
- ✅ Tanya Claude pakai bahasa awam, gak perlu jargon teknis
- ✅ Kalau Claude bingung, kasih lebih banyak konteks daripada kurang
- ✅ Minta Claude jelasin sebelum eksekusi untuk fitur kompleks

### Don'ts
- ❌ Jangan skip Phase 0 (setup) — kalau ini gak rapih, semua bermasalah
- ❌ Jangan langsung Phase 6 (send engine) tanpa Phase 0-5 selesai
- ❌ Jangan ignore error meski "kelihatan kecil"
- ❌ Jangan deploy ke Vercel tanpa test lokal dulu
- ❌ Jangan share env keys di chat publik atau commit ke Git
- ❌ Jangan abaikan tests/checks yang ada di roadmap

## Checklist Sebelum Lanjut Fase Baru

Per fase ada di roadmap, tapi general:
- [ ] Semua test manual di fase ini pass
- [ ] No console errors di browser
- [ ] No errors di Vercel deploy logs
- [ ] No errors di Supabase function logs
- [ ] Git committed dengan message jelas
- [ ] Coba aplikasi end-to-end sebagai user (bukan cuma developer)

## Tools Penting selama Development

### Browser Extensions
- React Developer Tools
- Supabase Inspector (kalau ada)

### CLI Tools
- `supabase` CLI untuk DB migrations
- `vercel` CLI untuk deploy testing

### Online Tools
- [Mail Tester](https://www.mail-tester.com/) — cek spam score email pertama
- [GlockApps](https://glockapps.com/) — inbox placement testing (free trial)
- [DNS Checker](https://dnschecker.org/) — verify SPF, DKIM, DMARC kalau pakai custom domain

## Maintenance Mindset

App ini gak "selesai" pas MVP launched. Maintenance ongoing:
- Weekly: cek dashboard health, response user issues
- Monthly: audit metrics, optimize slow queries
- Quarterly: review template performance, update copy
- Yearly: re-evaluate stack, consider upgrades

## Saat Mau Pindah ke Production "Serius"

Setelah app dipake sebulan dengan stable:
1. Beli custom domain (Niagahoster, Cloudflare Registrar, Namecheap)
2. Setup Google Workspace atau Zoho Mail
3. Setup SPF, DKIM, DMARC
4. Warm-up domain selama 2-3 minggu
5. Pertimbangkan upgrade ke Supabase Pro ($25/mo) untuk:
   - DB > 500MB
   - Better connection pooling
   - Daily backups automatic
   - No auto-pause
6. Vercel Pro ($20/mo) optional kalau butuh longer function time atau team

**Tapi semua ini OPTIONAL.** Free tier valid untuk personal use atau small team.

## Final Words

Lu punya 0% pengetahuan coding, tapi lu punya:
- Logic yang baik
- Pengalaman sebagai user (lu yang akan pake aplikasinya)
- Spec yang detail
- Tool seperti Claude

Itu udah cukup untuk bangun MVP yang berfungsi. Yang penting:
1. **Sabar** — vibe coding bukan magic, butuh iterasi
2. **Detail** — ngomong sama Claude harus spesifik
3. **Test** — manual test setelah tiap perubahan
4. **Commit** — Git save sering, biar bisa rollback kalau perlu

Good luck. Lu pasti bisa.
