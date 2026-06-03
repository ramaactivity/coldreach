# Addendum buat IMPLEMENTATION-PROMPT.md — Audit & Layar Tak-Terdokumentasi

> Sisipin ke prompt Claude Code. Tambahin `docs/DESIGN-PATTERNS.md` ke daftar sumber kebenaran (jadi 4 dokumen),
> sisipin **FASE 0.5** di bawah ini setelah Fase 0, dan tambahin **aturan layar tak-terdokumentasi** ke "Aturan keras".

## Tambahan ke "Sumber kebenaran"
4. **`docs/DESIGN-PATTERNS.md`** — protokol ekstensi + recipe buat layar/popup/fitur yang GAK ada di screenshot. Ini
   yang lo pakai tiap ketemu surface yang gak disebut di DESIGN.md.

## Tambahan ke "Aturan keras"
- **Layar tak-terdokumentasi → compose, jangan ngarang.** Tiap ketemu komponen/popup/halaman yang gak disebut eksplisit
  di DESIGN.md, jalanin decision tree di DESIGN-PATTERNS §2 dan pakai recipe di §3. DILARANG bikin pattern generic baru.
  Token/primitive baru cuma lewat bar di §5 (default jawabannya: gak usah, rakit dari yang ada).
- **Tiap data surface wajib punya 5 state** (loading/empty/error/partial/populated) sesuai DESIGN-PATTERNS §4. Kalau
  ada yang belum ada di kode, itu gap yang harus diisi — walaupun gak pernah gue screenshot.

---

## FASE 0.5 — Audit & Coverage Map  (setelah Fase 0, sebelum Fase 1)

Tujuan: ubah "layar yang gak ke-screenshot" jadi daftar konkret yang bisa direview, sebelum nyentuh visual.

1. **Enumerate semua surface:**
   - Semua route: `src/app/**/page.tsx` (+ `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`).
   - Semua komponen: `src/components/**/*.tsx`.
   - Semua overlay: grep `Dialog`, `Modal`, `Sheet`, `Popover`, `DropdownMenu`, `Tooltip`, `role="dialog"`, portal Radix.
2. **Bikin coverage map** (tabel): tiap surface → komponen DESIGN.md atau recipe DESIGN-PATTERNS §3 yang nge-cover.
3. **Flag list:** surface yang gak ada padanannya. Tiap item flagged → tunjuk recipe §3 terdekat, atau eskalasi §5.
4. **State-coverage scan:** tiap list/table/grid/panel → cek 5 state (loading/empty/error/partial/populated). Tandai
   yang kurang.
5. **Jangan tebak-tebak.** Kalau ada flow yang ambigu (misal Import CSV multi-step yang belum jelas alurnya di kode),
   tulis di flag list sebagai "butuh konfirmasi", jangan diem-diem bikin asumsi.

- **GATE:** keluarin (a) coverage map, (b) flag list dengan recipe yang diusulin per item, (c) daftar state yang kurang.
  Berhenti, tunggu gue review & konfirm sebelum lanjut Fase 1. Ini gate paling penting — di sini gue mutusin layar
  mana yang lo handle otomatis vs yang gue arahin manual.

## Tambahan ke FASE 4 (Page sweep)
Saat nyapu tiap page, kerjain juga surface dari flag list yang udah gue approve: rakit pakai recipe §3, lengkapi 5
state per §4. Setiap surface tak-terdokumentasi yang lo selesaikan, catat di ringkasan: surface → recipe yang dipakai.
Kalau lo kepaksa nambah token/variant baru, ikutin §5 dan update DESIGN.md + theme.css di pass yang sama.
