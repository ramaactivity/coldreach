# Pembaruan Cold Reach untuk skill `prospek-korporat` (1)

Dari: sesi Claude di repo `cold-reach`
Untuk: sesi Claude di repo `HERMES`

Saya sudah membaca `config/sales/prospek-korporat/SKILL.md` dan dua draf pertama yang masuk ke Cold Reach (SCBD Data Center, Kadin Indonesia). Alurnya sudah jalan: kontak, `external_ref`, telepon, dan website tersimpan benar, dan mode persetujuan sekarang **auto**. Ada empat hal yang perlu kamu sesuaikan di skill.

## 1. Baru di Cold Reach: `draf_daftar({ ids })` mengembalikan isi lengkap

`draf_daftar` biasa memotong `isi` menjadi 200 karakter. Dengan `ids: [id]`, kamu mendapat subjek + isi **lengkap** untuk draf itu, apa pun statusnya.

Ubah langkah **"lihat 2"**: ambil dari `draf_daftar({ ids: [id] })`, bukan dari `draf_kirim` atau Tetra Ops `prospek_daftar`. Rama bisa mengubah draf langsung di halaman Draf Hermes Cold Reach, dan teks di Tetra Ops tidak ikut berubah.

Juga baru: halaman Draf Hermes (`/w/hermes-sales/drafts`) sekarang menampilkan draf **dijadwalkan yang belum terkirim**, dan Rama bisa mengubah atau membatalkannya di sana. Jadi di mode auto pun draf bisa berubah di luar percakapan.

## 2. Jangan memetakan nomor berdasarkan posisi

Skill sekarang mengambil ulang `draf_daftar` saat Rama membalas, lalu memetakan "kirim 1, 3" / "ubah 2" / "batal 4" berdasarkan urutan. Runner Cold Reach mengirim setiap 15 menit pada 08.00–16.00. Kalau satu draf terkirim di antara laporan dan balasan Rama, daftar `dijadwalkan` bergeser satu, dan "batal 4" bisa membatalkan perusahaan yang salah.

Perbaikan: saat menulis laporan, simpan pasangan nomor → `id` (dan nama perusahaan). Saat Rama membalas, pakai `id` yang tersimpan. Kalau tidak ada, cocokkan dengan `perusahaan`/`email` di hasil `draf_daftar`. Sebutkan nama perusahaannya ke Rama sebelum memanggil tool.

## 3. Draf belum mengikuti aturan skill sendiri

Dari dua draf pertama:
- **SCBD Data Center** memakai "pusat data dan layanan IT **terkemuka**". Skill melarang pujian umum seperti "terkemuka".
- Keduanya membuka dengan asumsi ("kami berasumsi perusahaan Bapak/Ibu rutin mengadakan…", "tentu sering menggelar…"), bukan **sinyal spesifik** hasil riset (tahun berdiri / anniversary, acara yang pernah diposting, kantor baru).
- Kalimat pembuka yang menebak terasa seperti template massal, dan justru itu yang menurunkan balasan.

Saran: kalau riset tidak menemukan sinyal spesifik, pakai satu fakta konkret dari website mereka (layanan, lokasi, jumlah cabang) tanpa menebak kebiasaan acaranya.

## 4. Jangan pakai `{first_name}` untuk menyebut PIC

Cold Reach merender `{first_name}` dari data kontak yang tersimpan, bukan dari `nama_pic` yang kamu kirim. `nama_pic` hanya mengisi nama kalau kontak itu belum punya nama sama sekali, jadi kontak lama bisa saja menyimpan nama orang lain. Kalau tahu nama PIC, **tulis namanya langsung** di `isi` ("Halo Ibu Sari,"). Kalau tidak tahu, tetap "Halo Bapak/Ibu,".

## Tidak berubah

URL, token, nama tool lain, dan format hasil tetap sama seperti di handoff sebelumnya (`docs/15-Hermes-MCP-Handoff.md` di repo cold-reach, sudah diperbarui dengan parameter `ids`).
