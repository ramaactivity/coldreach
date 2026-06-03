# 05 — UI Design System

Design system untuk ColdReach. Goal: profesional, fungsional, fokus produktivitas. Bukan flashy, bukan playful.

## 1. Design Principles

1. **Density over decoration** — sales tools harus padat informasi tapi gak crowded
2. **Action-oriented** — primary actions selalu jelas dan nyolok
3. **Status visibility** — user harus selalu tau di state mana sekarang
4. **Forgiving** — destructive actions selalu confirm, ada undo dimanapun mungkin
5. **Indonesian-first** — copy bahasa Indonesia natural, gak kaku, gak terjemahan google

## 2. Brand & Tone

- **Vibe:** Profesional tapi approachable, kayak GitHub atau Linear
- **Voice:** Kasual tapi jelas, "lu" dan "kita" oke buat documentation, tapi UI app pakai "Anda" atau impersonal
- **Logo placeholder:** Simple wordmark "ColdReach" atau diganti user later

## 3. Color Palette

### Primary
```css
--primary-50:  #eff6ff;
--primary-100: #dbeafe;
--primary-500: #3b82f6;  /* Main brand blue */
--primary-600: #2563eb;  /* Hover */
--primary-700: #1d4ed8;  /* Active */
--primary-900: #1e3a8a;
```

### Neutral (Gray)
```css
--neutral-0:   #ffffff;
--neutral-50:  #f9fafb;
--neutral-100: #f3f4f6;
--neutral-200: #e5e7eb;
--neutral-300: #d1d5db;
--neutral-400: #9ca3af;
--neutral-500: #6b7280;
--neutral-600: #4b5563;
--neutral-700: #374151;
--neutral-800: #1f2937;
--neutral-900: #111827;
```

### Semantic
```css
/* Success — sent, delivered, opened */
--success-50:  #f0fdf4;
--success-500: #22c55e;
--success-700: #15803d;

/* Warning — paused, bounce risk */
--warning-50:  #fffbeb;
--warning-500: #f59e0b;
--warning-700: #b45309;

/* Danger — bounced, error, blocked */
--danger-50:   #fef2f2;
--danger-500:  #ef4444;
--danger-700:  #b91c1c;

/* Info — replied, opened */
--info-50:     #eff6ff;
--info-500:    #3b82f6;

/* Special — replied (paling penting!) */
--reply-50:    #f5f3ff;
--reply-500:   #8b5cf6;  /* Purple, beda dari yang lain biar nyolok */
--reply-700:   #6d28d9;
```

### Dark Mode
Support dark mode dari awal. Pakai `next-themes`.
```css
/* Dark mode auto-flip via Tailwind dark: */
/* Background: --neutral-900 */
/* Card: --neutral-800 */
/* Border: --neutral-700 */
/* Text: --neutral-100 */
```

## 4. Typography

### Font Family
- **Sans (UI):** Inter (Google Fonts), fallback system-ui
- **Mono (code, ID, technical):** JetBrains Mono atau system mono

### Scale
```css
/* Display — landing page */
--text-display: 3.5rem; /* 56px */
font-weight: 700;
line-height: 1.1;

/* H1 — page title */
--text-h1: 2rem; /* 32px */
font-weight: 700;
line-height: 1.2;

/* H2 — section title */
--text-h2: 1.5rem; /* 24px */
font-weight: 600;
line-height: 1.3;

/* H3 — card title */
--text-h3: 1.125rem; /* 18px */
font-weight: 600;
line-height: 1.4;

/* Body */
--text-base: 0.875rem; /* 14px — default UI size */
font-weight: 400;
line-height: 1.5;

/* Small */
--text-sm: 0.8125rem; /* 13px — captions, helper */

/* Tiny */
--text-xs: 0.75rem; /* 12px — labels, timestamps */
```

## 5. Spacing & Layout

### Spacing scale (Tailwind default)
0.25rem (1) → 0.5rem (2) → 0.75rem (3) → 1rem (4) → 1.5rem (6) → 2rem (8) → 3rem (12) → 4rem (16)

### Container
- Max width pada page: 1280px untuk dashboard, 720px untuk forms/setup
- Sidebar: 240px fixed
- Main content padding: 2rem (32px) desktop, 1rem (16px) mobile

### Border radius
```css
--radius-sm:  0.25rem;  /* 4px — inputs, badges */
--radius-md:  0.5rem;   /* 8px — buttons, cards */
--radius-lg:  0.75rem;  /* 12px — modals */
--radius-xl:  1rem;     /* 16px — large cards */
```

## 6. Shadow

```css
--shadow-sm:  0 1px 2px 0 rgb(0 0 0 / 0.05);
--shadow-md:  0 4px 6px -1px rgb(0 0 0 / 0.1);
--shadow-lg:  0 10px 15px -3px rgb(0 0 0 / 0.1);
--shadow-xl:  0 20px 25px -5px rgb(0 0 0 / 0.1);
```

Subtle shadow > heavy shadow. Borders > shadows untuk separasi default.

## 7. Components Library (shadcn/ui based)

Pakai shadcn/ui sebagai base, customize colors via CSS variables di atas.

### 7.1 Button Variants
- **Primary:** Filled blue, untuk main action
- **Secondary:** Outline gray, untuk secondary action
- **Ghost:** Transparent, untuk tertiary
- **Destructive:** Filled red, untuk delete
- **Link:** Underline only

Sizes: sm (h-8), default (h-10), lg (h-12)

### 7.2 Status Badge
Komponen khusus untuk status email/contact. Color-coded:
- Pending → gray
- Sending → blue (animate pulse)
- Sent → green
- Opened → cyan
- **Replied → purple** (paling nyolok, ini yang kita kejar)
- Bounced → red
- Unsubscribed → orange
- Failed → red dark

### 7.3 Input
- Default border, focus ring biru
- Error state: red border, helper text di bawah
- Icon support kiri/kanan
- Disabled state jelas (gray bg)

### 7.4 Select / Dropdown
Pakai Radix UI Select via shadcn. Searchable variant via Combobox.

### 7.5 Table
- Header: sticky, bg neutral-50, font medium
- Row: hover bg neutral-50, border bottom neutral-200
- Selected: bg primary-50
- Padding: py-3 px-4 default
- Truncate text panjang dengan tooltip on hover

### 7.6 Modal / Dialog
- Backdrop: bg black/40 backdrop-blur-sm
- Content: max-width 500px default, 800px untuk wizard
- Close button kanan atas
- Footer dengan action buttons (cancel kiri, primary kanan)

### 7.7 Toast
Pakai sonner. Posisi top-right.
- Success: green check
- Error: red x
- Info: blue info
- Loading: spinner
- Promise: auto-handle resolve/reject

### 7.8 Empty State
Komponen reusable untuk "no data":
- Illustration icon (Lucide outline, neutral-300)
- Headline + description
- CTA button kalau ada

### 7.9 Loading States
- Skeleton untuk content loading (shadcn Skeleton)
- Spinner untuk inline loading
- Progress bar untuk upload, campaign progress
- "Optimistic UI" sebanyak mungkin

## 8. Page Layouts

### 8.1 App Shell
```
┌──────────────────────────────────────────────┐
│ Topbar (logo, search, profile, notifications) │
├──────┬───────────────────────────────────────┤
│      │                                       │
│ Side │                                       │
│ bar  │         Main Content                  │
│      │                                       │
│      │                                       │
└──────┴───────────────────────────────────────┘
```

Sidebar items:
- Dashboard (icon: home)
- Contacts (icon: users)
- Templates (icon: file-text)
- Campaigns (icon: send)
- Settings (icon: settings)

Bottom of sidebar:
- Connected account selector
- Quota indicator (visual: progress bar "23/30 sent today")

### 8.2 Page Header
Setiap halaman main punya header pattern:
```
[Page Title]                    [Primary Action Button]
[Optional description]
─────────────────────────────────────────────────────
[Filters / tabs / search]
─────────────────────────────────────────────────────
[Content]
```

### 8.3 Wizard Pattern (Campaign Create)
```
┌──────────────────────────────────────────────┐
│  ●───●───●───●───○                           │
│  1   2   3   4   5                            │
│ Setup Audi Sched FU  Review                   │
├──────────────────────────────────────────────┤
│                                              │
│         [Step Content]                       │
│                                              │
├──────────────────────────────────────────────┤
│ [Back]                          [Next →]     │
└──────────────────────────────────────────────┘
```

## 9. Critical UI Patterns

### 9.1 Quota Indicator
Selalu visible di sidebar atau top:
```
┌─────────────────────┐
│ Today's Send Quota  │
│ ████████░░░ 23/30   │
│ Reset in 8h 23m     │
└─────────────────────┘
```
Warna:
- Green: < 70%
- Yellow: 70-90%
- Red: > 90%

### 9.2 Health Indicator
Sender health score, visible di Settings dan Dashboard:
```
┌─────────────────────┐
│ Sender Health       │
│ 🟢 Healthy          │
│ • Bounce: 1.2% ✓    │
│ • Spam: 0% ✓        │
│ • Reply: 18% ✓      │
└─────────────────────┘
```

### 9.3 Activity Feed
Real-time feed dengan timestamp relative:
```
🟣 Andi membuka email "Outreach EO Q2"   2 mnt lalu
🟢 Email terkirim ke jane@co.id          5 mnt lalu
🔴 Email ke bob@xyz.com bounced          12 mnt lalu
```

### 9.4 Filter Chips
Filter aktif tampil sebagai chip dismissable:
```
[Tag: WO Bogor ×] [Status: Active ×] [Last contact: > 30 days ×] Clear all
```

### 9.5 Bulk Action Bar
Muncul saat ada selection:
```
[3 contacts selected]   [Tag] [Add to Campaign] [Export] [Delete]
```

## 10. Empty State Examples

### No contacts yet
```
[Icon: Users, neutral]
"Belum ada kontak"
"Mulai dengan import database CSV atau tambah kontak satu per satu"
[Primary: Import CSV]  [Secondary: Add Manually]
```

### No campaigns yet
```
[Icon: Send, neutral]
"Belum ada campaign"
"Bikin campaign pertama Anda untuk mulai outreach"
[Primary: Create Campaign]
```

### Campaign in progress
```
[Animated icon: dot pulsing]
"Campaign berjalan..."
"23 dari 100 email terkirim. Estimasi selesai dalam 2 jam."
[Pause Campaign] [View Details]
```

## 11. Microcopy Guide (Bahasa Indonesia)

### Buttons
- Save → "Simpan"
- Cancel → "Batal"
- Delete → "Hapus"
- Send → "Kirim"
- Schedule → "Jadwalkan"
- Pause → "Jeda"
- Resume → "Lanjutkan"
- Import → "Impor"
- Export → "Ekspor"

### Status
- Pending → "Menunggu"
- Sending → "Mengirim"
- Sent → "Terkirim"
- Opened → "Dibuka"
- Replied → "Dibalas"
- Bounced → "Bounce"
- Unsubscribed → "Berhenti berlangganan"
- Failed → "Gagal"

### Confirmation
- Delete contact: "Hapus kontak ini? Tindakan ini tidak bisa dibatalkan."
- Pause campaign: "Jeda campaign? Email yang sudah terjadwal hari ini akan tetap dikirim."
- Disconnect Gmail: "Putuskan akun Gmail ini? Campaign yang menggunakan akun ini akan paused."

### Errors
- Network: "Tidak bisa terhubung. Cek koneksi Anda."
- Quota: "Quota harian habis. Reset besok pukul 00:00 WIB."
- Token: "Akun Gmail butuh disambungkan ulang. Klik sini untuk reconnect."
- Invalid email: "Format email tidak valid"

## 12. Iconography

Pakai **Lucide React** sebagai icon set utama. Konsisten 16px untuk inline, 20px untuk button, 24px untuk navigation.

Common icons:
- `Send` — campaigns, send action
- `Users` — contacts
- `FileText` — templates
- `Mail` — email
- `MailOpen` — opened
- `Reply` — replied
- `AlertTriangle` — warning, bounce
- `CheckCircle` — success
- `Clock` — pending, scheduled
- `Pause` / `Play` — pause/resume
- `Settings` — settings
- `Plus` — add new
- `Trash2` — delete
- `Search` — search
- `Filter` — filter
- `Download` / `Upload` — export/import

## 13. Responsive Breakpoints (Tailwind default)
- sm: 640px (mobile landscape)
- md: 768px (tablet)
- lg: 1024px (laptop)
- xl: 1280px (desktop) — default design target
- 2xl: 1536px

## 14. Animation Guidelines

Subtle, fast, purposeful.
- Duration: 150ms (instant feedback), 300ms (transitions), 500ms (page change)
- Easing: ease-out untuk masuk, ease-in untuk keluar
- Reduce motion respect: `@media (prefers-reduced-motion)` disable non-essential

Common animations:
- Fade in modal: 200ms
- Slide in toast: 300ms
- Hover button: 150ms
- Skeleton pulse: 1.5s infinite
- Status badge "sending": pulse animation

## 15. Accessibility (a11y)

- Semua interactive elements harus keyboard accessible
- Focus ring jelas (default Tailwind ring biru)
- Color contrast minimum WCAG AA (4.5:1 untuk teks normal)
- Status gak cuma tergantung warna (selalu ada icon atau text)
- Form labels selalu ada
- Error messages explicit, gak cuma red border
- ARIA labels pada icon buttons
