# Handoff: Cold Reach MCP untuk agent `sales` Hermes

Dari: sesi Claude di repo `cold-reach` (1 Oktober 2026)
Untuk: sesi Claude di repo `HERMES`

## Tugasmu

Cold Reach sekarang punya MCP server yang bisa **mengirim** email prospek atas nama Rama. Yang perlu kamu kerjakan di repo HERMES:

1. Pasang MCP ini di profil `sales`.
2. Ubah skill agent supaya alurnya: riset → `kontak_cek` → tulis draf → `draf_kirim` → lapor ke topic Sales Telegram → Rama menyetujui → `draf_setujui`.
3. Sinkronkan status kiriman dan balasan ke tabel `prospek` di Tetra Ops memakai `external_ref`.

Jangan mengubah repo cold-reach. Kalau butuh perubahan di sisi Cold Reach, tulis permintaannya untuk Rama.

## Koneksi

| | |
|---|---|
| URL | `https://coldreach-beta.vercel.app/api/mcp` |
| Transport | JSON-RPC 2.0 polos lewat satu `POST`, stateless, tanpa sesi/SSE. Method: `initialize`, `ping`, `tools/list`, `tools/call`. Notifikasi dijawab `202`. `GET` dijawab `405`. Polanya sama dengan MCP Tetra Ops. |
| Auth | Header `Authorization: Bearer <HERMES_MCP_TOKEN>`. Tanpa token atau token salah: `401`. |
| Token | **Minta langsung ke Rama.** Rama mengambilnya di Vercel → project `coldreach` → Settings → Environment Variables → `HERMES_MCP_TOKEN` → reveal. Simpan di env VPS Hermes, jangan di repo atau di chat. |

Server terkunci ke satu user dan satu workspace (**Hermes Sales**, slug `hermes-sales`). Tool tidak bisa membaca atau mengubah workspace lain, dan tidak ada tool hapus.

Cek cepat:

```bash
curl -s -X POST https://coldreach-beta.vercel.app/api/mcp \
  -H "Authorization: Bearer $COLDREACH_MCP_TOKEN" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Hasil `tools/call` selalu berbentuk `result.content[0].text`, berisi JSON. Kalau ada kesalahan, `result.isError: true` dan isinya `{"error": "<pesan bahasa Indonesia yang bisa dibacakan ke Rama>"}`.

## Cara Cold Reach mengirim (penting untuk ekspektasi)

- Hermes **tidak pernah mengirim langsung**. `draf_kirim` hanya memasukkan draf ke antrean. Pengiriman dilakukan runner Cold Reach setiap 15 menit, hanya di dalam jendela kirim **Senin–Jumat 08.00–16.00 WIB**, dan tidak pada libur nasional atau cuti bersama.
- Pengirimnya **ramadan@tetraphoto.com**. Mailbox ini dipakai bersama antrean massal TETRA, jadi kuota hariannya juga dibagi. Domainnya masih dalam masa warmup (sekitar 20/hari di awal, naik bertahap). Draf Hermes yang sudah disetujui didahulukan daripada antrean TETRA.
- Batas **15 email baru per hari** untuk Hermes Sales. Follow-up tidak masuk hitungan ini.
- Pengaman yang tetap berlaku:
  - Cooldown 45 hari per orang, lintas semua workspace.
  - Maksimal 2 email/hari dan 8 email/14 hari per domain perusahaan.
  - Jeda 30 hari kalau rekan sekantor sudah membalas.
  - Alamat yang pernah bounce atau unsubscribe tidak dikirimi lagi selamanya.
  - Header List-Unsubscribe one-click dan link berhenti berlangganan ditambahkan otomatis.
- Follow-up otomatis ada 2: **hari ke-4** dan **hari ke-7**. Ditulis Cold Reach, membalas di thread yang sama, berhenti otomatis kalau penerima membalas, dan ditunda kalau penerima sedang cuti (auto-reply). Hermes **tidak** perlu menulis follow-up.
- Draf yang tertahan oleh batas domain atau kuota tidak gagal; draf itu **tertunda** ke hari berikutnya.

## Aturan menulis draf

- `isi` berupa teks polos bahasa Indonesia yang sopan, **diakhiri `Salam,`**. **Jangan menulis tanda tangan, nama, website, atau link unsubscribe**; Cold Reach menambahkan tanda tangan "Rama — Tetra Photobooth / tetraphoto.com" dan footer berhenti berlangganan.
- Placeholder `{first_name}`, `{company}`, `{position}` boleh dipakai dan akan dirender (nama perusahaan otomatis dirapikan; "PT"/"Tbk" dibuang). Kalau `nama_pic` tidak diketahui (alamat hr@/info@), jangan pakai `{first_name}`; tulis "Halo Bapak/Ibu,".
- `subjek` pendek dan personal (2–6 kata), tanpa kata "gratis" atau tanda seru.
- Satu email = satu perusahaan = satu `external_ref` (id prospek Tetra Ops).

## Tool

Semua tanggal dalam WIB (`YYYY-MM-DD`). `id` adalah UUID baris draf di Cold Reach.

### Baca (`readOnlyHint: true`)

**`kontak_cek({ emails: string[1..50] })`**
Panggil **sebelum menulis draf** supaya tidak membuang tenaga.
Hasil per email: `{ email, bisa_dikirim, alasan?: string[], terakhir_dihubungi?: { tanggal, workspace } }`.
Contoh alasan:
- `status kontak: unsubscribed`
- `pernah bounce`
- `pernah membalas (Tetra Photobooth, 2026-08-02)`
- `cooldown sampai 2026-11-15 (terakhir dihubungi Tiska Catering)`
- `sudah di antrean workspace Tetraphoto`
- `rekan sekantor di x.co.id sudah membalas, jeda 30 hari`
- `domain x.co.id sudah dihubungi 2x hari ini (akan dikirim di hari lain)`

Alasan "domain … hari ini/14 hari" hanya **menunda**; draf tetap diterima. Semua alasan lain membuat `draf_kirim` menolak email itu. Laporkan alasannya ke Rama apa adanya.

**`draf_daftar({ status?: "menunggu_persetujuan" | "dijadwalkan" | "terkirim_hari_ini", ids?: string[] })`**
Tanpa `status`: ketiga kelompok sekaligus. Hasil per draf: `{ id, status, perusahaan, email, subjek, isi (200 karakter pertama), external_ref, tanggal_baru?, alasan?, terkirim? }`. Urutan: yang paling lama dibuat lebih dulu.
Dengan `ids`: hanya draf itu (status apa pun), dengan `isi` **lengkap**. Pakai ini untuk "lihat N", karena draf bisa diubah Rama di Cold Reach.

**`status_kiriman({ sejak?: "YYYY-MM-DD" })`** (default 30 hari terakhir)
Hasil per penerima: `{ id, external_ref, email, perusahaan, status, terkirim?, follow_up?: [{ ke, tanggal }], dibalas?: { tanggal, klasifikasi }, bounce?, tanggal_baru?, alasan? }`.
Nilai `status`: `menunggu_persetujuan`, `dijadwalkan`, `tertunda` (lihat `tanggal_baru` + `alasan`), `terkirim`, `dibalas`, `bounce`, `unsubscribe`, `dibatalkan`.
**Pakai ini untuk sinkron ke Tetra Ops**, dicocokkan lewat `external_ref`.

**`balasan_daftar({ belum_ditangani?: boolean })`** (default `true`)
Hasil: `{ id, perusahaan, email, klasifikasi, cuplikan, waktu, link_thread, external_ref, ditangani }`.
- `klasifikasi`: `interested`, `question`, `not_interested`, `unsubscribe_request`, `other`, atau `null` (pengklasifikasi Gemini gratis hanya 20 panggilan/hari; kalau habis, nilainya `null`, jadi baca `cuplikan` sendiri).
- `cuplikan` berisi teks balasan tanpa kutipan email lama, maksimal 2.000 karakter. Pakai ini untuk menyiapkan **saran balasan** untuk Rama.
- `link_thread` selalu `null` untuk mailbox ramadan@ (bukan Gmail). Rama membalas dari Hostinger webmail; cari dengan email pengirim.

**`kuota({})`**
Akun pengirim, `kuota_akun_hari_ini`, `terpakai_akun_hari_ini`, `warmup: { hari_ke, batas }`, `batas_email_baru_per_hari`, `email_baru_terkirim_hari_ini`, `mode_persetujuan`, `antrean: { menunggu_persetujuan, dijadwalkan }`, dan `jendela_kirim_berikutnya`. Pakai ini untuk memutuskan berapa banyak draf yang layak dibuat hari ini; draf berlebih hanya akan menumpuk.

### Tulis (`readOnlyHint: false`)

**`draf_kirim({ items: [1..25] })`**
Item: `{ email, nama_perusahaan, website?, telepon?, nama_pic?, jabatan_pic?, subjek (≤200), isi (20..5000), external_ref }`.
- Kontak digabung dengan database Cold Reach berdasarkan email. Kontak lama tidak dibuat ulang dan data yang sudah terisi tidak ditimpa; hanya kolom kosong yang diisi.
- **Idempoten per `external_ref`**: kalau dipanggil ulang, hasilnya baris yang sama dengan `alasan: "sudah pernah dikirim (idempoten)"`. Aman untuk retry.
- Hasil: `{ mode_persetujuan, hasil: [{ email, external_ref, id, status: "menunggu_persetujuan" | "dijadwalkan" | "ditolak", alasan?, catatan? }] }`.
  - `dijadwalkan` hanya muncul kalau Rama sudah memindah mode ke otomatis.
  - `catatan` berisi info penundaan domain.

**`draf_setujui({ ids?: string[], semua?: boolean })`**
Memindahkan draf dari menunggu persetujuan ke antrean kirim. Hasil: `{ disetujui, dijadwalkan, per_hari, perkiraan_mulai, perkiraan_selesai }`.

**`draf_ubah({ id, subjek?, isi? })`**
Hanya untuk draf yang belum terkirim.

**`draf_batalkan({ ids: string[], alasan? })`**
Draf tidak akan dikirim. Status menjadi `dibatalkan`.

**`balasan_tandai({ id })`**
Tandai balasan sudah ditangani setelah Rama menanggapinya. `id` diambil dari `balasan_daftar`.

## Alur harian yang disarankan

1. Pagi: `kuota()` untuk tahu kapasitas hari ini.
2. Riset perusahaan, lalu `kontak_cek` untuk semua kandidat email. Buang yang `bisa_dikirim: false` (kecuali alasan domain sementara) dan catat alasannya.
3. Tulis draf, lalu `draf_kirim`. Simpan `id` yang dikembalikan bersama prospek di Tetra Ops.
4. Laporan ke topic Sales: daftar bernomor (perusahaan, email, subjek, ringkasan isi), ditambah daftar yang ditolak beserta alasannya.
5. Balasan Rama:
   - "kirim semua" → `draf_setujui({ semua: true })`.
   - "kirim 1, 3" → petakan nomor ke `id` dari laporan yang kamu kirim, lalu `draf_setujui({ ids })`.
   - "ubah 2: …" → `draf_ubah`.
   - "batal 4" → `draf_batalkan`.
   Laporkan `perkiraan_mulai`/`perkiraan_selesai`.
6. Sore atau besok pagi: `status_kiriman` → sinkron ke Tetra Ops. `balasan_daftar` → kirim ke Rama berisi cuplikan + saran balasan → setelah Rama menanggapi, `balasan_tandai`.

Rama juga bisa menyetujui, mengubah, atau membatalkan draf sendiri di halaman **Draf Hermes** (`/w/hermes-sales/drafts`) di Cold Reach. Halaman itu menampilkan draf yang menunggu persetujuan dan draf yang dijadwalkan tapi belum terkirim. Jadi selalu baca status terbaru dari tool, jangan dari ingatanmu.

**Memetakan nomor laporan ke draf:** cocokkan dengan `perusahaan`/`email` (atau `id`/`external_ref` yang kamu simpan saat laporan), **jangan dengan posisi** di hasil `draf_daftar`. Runner mengirim setiap 15 menit, jadi daftar bisa bergeser antara laporan dan balasan Rama.

## Status saat handoff

- Sudah live di production sejak 1 Oktober 2026 (deploy `dpl_7XnjGs67vm7bF5uEXMeuGW2HJYgL`): `tools/list` di URL production mengembalikan 10 tool, tanpa token 401.
- Ketujuh uji lolos, termasuk kirim nyata (isi custom, tanda tangan, footer berhenti berlangganan, tanpa AI opener) dan balasan (`balasan_daftar` mengembalikan `klasifikasi: "interested"`, `cuplikan: "Halo terimakasih lanjut"` dengan kutipan email lama terbuang).
- Data uji di antrean Hermes Sales: `external_ref` `uji-hermes-001` (terkirim ke tetraphotobooth+hermes-uji1@gmail.com), `uji-hermes-003` dan `uji-hermes-004` (dibatalkan). Abaikan saat sinkron ke Tetra Ops.
- Mode persetujuan saat ini: **manual**. Rama yang memindahkannya ke otomatis lewat halaman Draf Hermes kalau sudah percaya pada kualitas draf.
