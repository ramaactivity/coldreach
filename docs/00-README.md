# Cold Email Automation Web App — Master Documentation

## ⭐ MULAI DARI SINI

**File 14 (`14-Final-MVP-Decision.md`) adalah single source of truth untuk MVP.** Semua keputusan final ada di situ. Kalau ada konflik dengan file lain, IKUTI FILE 14.

File 1-13 adalah dokumen referensi yang detail per area, tapi ada fitur yang dibatalin/disederhanakan di file 14.

## Overview Singkat

Aplikasi web untuk otomasi cold email via Gmail, dirancang untuk sales/marketing yang butuh mengelola outreach skala kecil-menengah dengan budget Rp 0. Multi-workspace untuk multi-business support.

**Founding context:** Dibangun untuk Muhamad Ramadan Saputra (Tiska Catering, Bogor) yang juga jalankan Tetra Photobooth dan Visual Tetra. 3 bisnis terpisah, database kontak shared, 3 Gmail account terpisah.

**Working name:** ColdReach (boleh diganti)

## Daftar Dokumen

| # | Dokumen | Status |
|---|---------|--------|
| **14** | **Final MVP Decision** | ⭐ **READ FIRST — source of truth** |
| 00 | README (this file) | Navigasi |
| 11 | Founding User Customization | Konteks user spesifik |
| 12 | Multi-Workspace Architecture | Konsep arsitektur multi-business |
| 01 | PRD | Vision detail |
| 02 | FSD | Functional spec detail |
| 03 | TSD | Technical spec |
| 04 | Database Schema | DB structure |
| 05 | UI Design System | Design guidelines |
| 06 | API Specification | API contracts |
| 07 | Implementation Roadmap | Build order (lihat juga file 14) |
| 08 | Anti-Spam Strategy | Deliverability protection |
| 09 | Quick Start Antigravity | Cara prompt Claude |
| 10 | Migration Plan | Transisi dari Sheet existing |
| 13 | Free Tier Maximization | (Sebagian di-skip di MVP, lihat file 14) |

## ⚠️ Reading Order untuk Claude

Saat Claude di Antigravity baca dokumen ini:

1. **14-Final-MVP-Decision** ⭐ MULAI DI SINI
2. **11-Founding-User-Customization** (konteks user)
3. **12-Multi-Workspace-Architecture** (arsitektur)
4. **10-Migration-Plan** (existing system)
5. **08-Anti-Spam-Strategy** (penting untuk Gmail)
6. **04-Database-Schema** (data layer — cek update di file 14)
7. **01-PRD**, **02-FSD**, **03-TSD** (detail spec)
8. **05-UI-Design-System** (UI)
9. **06-API-Specification** (API)
10. **07-Implementation-Roadmap** (eksekusi — cek timeline di file 14)
11. **09-Quick-Start-Antigravity** (workflow)
12. **13-Free-Tier-Maximization** (referensi optional, cek file 14 untuk apa yang di-include)

## Filosofi Proyek

1. **Free tier maximalist** — semua pakai gratisan tanpa kompromi keamanan
2. **Vibe coding friendly** — dokumen dirancang biar Claude di Antigravity bisa eksekusi step by step
3. **Realistic scaling** — target awal 50-100 email/hari, bukan 10.000
4. **Deliverability over volume** — mending 50 email masuk inbox daripada 500 masuk spam
5. **Sales-first UX** — yang make sales, jadi UI harus bener-bener gampang, gak perlu training

## Stack Final (Free Tier Only)

- **Frontend + Backend:** Next.js 14 (App Router) di Vercel Hobby
- **Database + Auth:** Supabase Free
- **Email Sender:** Gmail API via OAuth (akun Gmail user)
- **Background Jobs:** Supabase pg_cron + Edge Functions
- **UI Library:** shadcn/ui + Tailwind CSS
- **State Management:** TanStack Query (server state) + Zustand (client state)
- **Deploy:** GitHub → Vercel auto-deploy

## Kenapa Stack Ini?

- Next.js bisa jadi frontend dan backend dalam satu codebase, deploy gampang
- Supabase punya database, auth, dan storage dalam satu paket gratis
- Gmail API gratis dan udah punya akun, gak perlu beli SMTP service
- shadcn/ui bukan library yang di-install, tapi komponen yang di-copy ke project, jadi bisa dimodifikasi bebas
- Semua tools punya dokumentasi bagus, AI-friendly, banyak referensi di internet

## How to Use This Doc with Claude in Antigravity

1. Buka project baru di Antigravity
2. Attach folder `docs/` ke context
3. Mulai dengan instruksi: "Baca semua dokumen di folder docs, mulai dari 00-README sampai 08. Setelah itu, mulai implementasi sesuai 07-Implementation-Roadmap.md tahap pertama."
4. Lakukan iteratif per fitur, jangan minta sekaligus
