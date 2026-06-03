# Prompt buat Claude Code (Antigravity) — ColdReach Frontend Refresh

> Copy semua yang di bawah garis ini ke Claude Code. Pastikan `DESIGN.md`, `theme.css`, dan
> `UI-COMPONENTS.md` sudah ada di `docs/` (atau root) repo dulu.

---

Lo akan ngerjain **frontend design refresh** buat aplikasi ini (ColdReach — cold-outreach tool: contacts CRM,
pipeline, templates, queues, inbox). Frontend sekarang inkonsisten dan kebaca "AI slop" — gue udah siapin design
system lengkap. Tugas lo: implementasiin, bukan re-desain ulang.

## Sumber kebenaran (baca dulu, jangan skip)
Ada 3 dokumen. Baca ketiganya full sebelum nulis kode apa pun:
1. **`docs/DESIGN.md`** — spesifikasi sistem (token, tipografi, komponen, do/don't, responsive). Ini "apa".
2. **`docs/theme.css`** — token layer Tailwind v4. Ini SINGLE SOURCE OF TRUTH buat semua nilai.
3. **`docs/UI-COMPONENTS.md`** — protokol rebuild + checklist + kode referensi tiap primitive. Ini "gimana".

Kalau ada konflik antara dokumen ini dan kode/style lama di repo → **dokumen menang**. Style lama dianggap usang.

## Aturan keras (non-negotiable)
- **`src/components/ui/*` satu-satunya rumah primitive visual.** Pages & feature component cuma *compose*, gak pernah
  re-style primitive, gak pernah hardcode hex/px.
- **Semua token dari satu file.** Merge `theme.css` ke `src/app/globals.css`. Gak ada warna/radius/shadow hardcoded
  di mana pun. Satu-satunya inline style yang boleh: `data-accent` per workspace.
- **Ink = aksi, accent = identitas.** Primary button & nav-active = ink (zinc-900). Accent (oranye Tiska) cuma buat
  identitas: dot, avatar, focus ring, selected state, link, accent-bar notice. Accent GAK PERNAH jadi fill tombol gede.
- **Card flat** — hairline border, NO shadow. Shadow cuma buat layer melayang (dropdown/dialog/toast).
- **Heading max weight 600.** Hapus semua `font-bold`/`font-extrabold` di judul → `font-semibold`.
- **Tabular numerals** di semua angka (stat-card, tabel, quota).
- **Metric color rule:** angka default `text-ink`; kasih warna semantik HANYA kalau ada valence (bounce → danger,
  reply → success). Counter biasa (Contacts, Templates) tetap netral. Gak ada rainbow.
- **Jangan sentuh** backend/API/route handler/DB/logic. Murni frontend: components, styles, page markup.
- **Jangan bikin versi "v1/legacy" buat kompatibilitas.** Kalau API primitive berubah, refactor call site-nya di pass
  yang sama. Cari & hapus string class lama.

## Urutan eksekusi — kerjain per FASE, berhenti di tiap gate
Jangan loncat fase. Setiap akhir fase: jalanin `npm run build` (atau `next build`) + `npm run lint`, laporin
hasilnya jujur, baru lanjut.

### FASE 0 — Setup
1. Buat branch baru: `git checkout -b design-refresh`.
2. Inventaris: list isi `src/components/ui/`, dan grep repo buat `shadow-`, `font-bold`, `font-extrabold`, hex literal
   (`#`), dan inline `style=` di components/pages. Simpen sebagai checklist yang harus dibersihin.
3. Pasang font Geist (`npm i geist`) + setup di `layout.tsx` (lihat UI-COMPONENTS §1). Pasang
   `class-variance-authority` kalau belum ada.
- **GATE:** report inventaris + jumlah pelanggaran yang ketemu. Build masih ijo. Belum ubah visual.

### FASE 1 — Token layer
1. Merge `theme.css` ke `src/app/globals.css` (setelah `@import "tailwindcss";`).
2. Pasang `data-accent={workspace.colorTheme}` di wrapper app-shell, mapping ke 8 preset (orange/pink/purple/blue/
   teal/green/red/slate). Default `orange`.
3. Verifikasi utility token kebentuk: `bg-surface`, `text-ink`, `border-border`, `bg-accent`, `rounded-lg`, `.tabular`.
- **GATE:** build ijo, app masih render (boleh keliatan belum berubah). Tunjukin diff `globals.css`.

### FASE 2 — Rebuild primitives di `src/components/ui/`
Rebuild satu-satu sesuai kode referensi di UI-COMPONENTS §2 + spec DESIGN.md. Minimal:
`button`, `badge`, `card`, `input`, `select` (trigger+menu styling), `checkbox`, `toggle`, `chip`, `filter-chip`,
`segmented-tabs`, `stat-card`, `progress`, `empty-state`, `notice` (apollo/holiday), `avatar`, `dialog`, `toast`,
`skeleton`/`spinner`, plus pattern `data-table` & `kanban-card`.
- Tiap primitive harus lulus **done-checklist** di UI-COMPONENTS §0 (token-only, focus-visible, disabled, tabular).
- Kalau prop API beda dari file lama → adopsi API baru, catat call site yang kena, refactor di Fase 3.
- **GATE:** build ijo. Tunjukin daftar primitive yang udah di-rebuild + yang prop API-nya berubah.

### FASE 3 — Composed components
Rebuild: `page-header`, `stat-card` grid usage, data table (header/row/two-line cell/selected), kanban column+card,
`notice` banners, `simple-topbar`, `workspace-switcher`, sidebar (brand dot + nav group + nav-item-active ink fill +
footer account). Semua pakai primitive Fase 2.
- **GATE:** build ijo. Screenshot/ringkas perubahan per komponen.

### FASE 4 — Page sweep
Sapu semua page (dashboard, contacts, contacts/discover, pipeline, inbox, templates, templates/[id], queues,
queues/[id], campaigns, settings). Tiap page:
- Ganti markup ke primitive baru, hapus inline style & hex sisa.
- Judul → `<h1>` 24/600. Angka → `.tabular`. Stat number → metric color rule.
- Bersihin semua pelanggaran dari checklist Fase 0.
- **GATE:** build ijo + lint bersih. Konfirmasi checklist Fase 0 = 0 pelanggaran tersisa.

## Kejujuran & verifikasi
- Jangan ngaku fase selesai tanpa build hijau. Kalau ada yang gak kelar, bilang apa adanya + alasannya.
- Tunjukin diff/ringkasan nyata tiap gate, jangan klaim umum.
- Commit per fase: `git commit -m "design-refresh: fase N — <ringkasan>"`.

## Banned (anti-slop, tolak walau "kelihatan bagus")
Gradient, glassmorphism, atmospheric bg, shadow di card, accent jadi fill CTA, primary button warna accent, rainbow
stat number, heading 700/800, mixing radius dalam satu komponen, hex/px hardcoded, font Inter/Roboto/Arial.

Mulai dari **Fase 0**. Setelah selesai inventaris, stop di gate dan tunggu gue konfirm sebelum lanjut Fase 1.
