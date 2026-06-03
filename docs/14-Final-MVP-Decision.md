# 14 — Final MVP Scope (Decided)

⭐ **Dokumen ini adalah keputusan final untuk MVP.** Setelah brainstorming panjang, ini yang akan dibangun. Semua doc sebelumnya adalah referensi, dokumen ini adalah TRUTH.

## Prinsip Keputusan

1. **Aman > Fancy** — pilih yang stable dan proven
2. **Lu vs Time** — vibe coding makan waktu, jangan overload Phase 1
3. **Bisa upgrade later** — arsitektur yang flexible
4. **Gak ada surprise cost** — semuanya gratis, no credit card

## Final Stack (Locked In)

| Layer | Tool | Why |
|-------|------|-----|
| Frontend + Backend | **Next.js 14 di Vercel Hobby** | Stable, AI-friendly, gampang deploy |
| Database + Auth | **Supabase Free** | All-in-one, generous free tier |
| File Attachment | **Supabase Storage 1GB** | Simple, in-stack (BUKAN Google Drive — terlalu complex) |
| Email Sending | **Gmail API per user** | Free, lu udah punya akun |
| AI Personalization | **Google Gemini Free** | 1500 req/day, masuk akal |
| Scheduled Jobs | **Supabase pg_cron** | Built-in, no external |
| Backup | **GitHub repo (schema only)** | Simple, code already there |

❌ **Yang dibatalin dari brainstorm sebelumnya:**
- Google Drive sebagai storage → SKIP. Pakai Supabase Storage 1GB cukup buat 1-2 PDF kecil.
- Drive backup → SKIP. GitHub aja cukup, plus user bisa export to Sheets manual.
- Cloudflare migration → SKIP. Vercel aja.
- Hunter.io, public scraping → SKIP. Out of scope MVP.

✅ **Yang dipertahankan:**
- Multi-workspace architecture (file 12)
- AI Personalization via Gemini (file 13)
- pg_cron untuk semua scheduling
- Self-ping anti pause
- Export to Google Sheets (UX bonus, simple)

## Final MVP Feature List (Locked)

### Core (must build)
1. Auth (Google OAuth)
2. **Multi-workspace** (3 workspace untuk Tiska, Photobooth, Visual)
3. Connect Gmail per workspace
4. Contacts shared (CRUD + import CSV + filter + tag)
5. Templates per workspace (rich editor + variable + 1 PDF attachment)
6. **Campaign creation dengan AUTOMATION** ← lu request, ini PRIORITY
7. Email sending dengan rate limit & delay
8. Tracking (open, reply, bounce)
9. Auto follow-up (kalau no reply dalam X hari)
10. Pipeline view per workspace
11. Dashboard (per workspace + cross-workspace)
12. AI personalization (Gemini)
13. **Recurring schedule (NEW)** ← yang lu request
14. **Workspace time-of-day defaults** ← yang lu request

### Skip dari MVP, Phase 2
- Drive integration
- Hunter.io enrichment
- A/B testing canggih
- Custom field complex
- Export to Sheets (delay ke Phase 2, bukan MVP)
- Click tracking detail

## Fitur Schedule & Automation (NEW — DETAIL)

Ini yang lu request. Gua bedah konkret.

### Konsep Inti

App harus bisa "kerja sendiri" di background. Lu setup sekali, sistem jalan otomatis.

3 layer automation:

**Layer 1: Recurring Daily Send (yang lu request)**
- "Setiap hari Senin-Jumat, kirim 30 email Tiska jam 09:00"
- "Setiap hari Senin-Jumat, kirim 20 email Photobooth jam 12:00"
- "Setiap hari Senin-Jumat, kirim 10 email Visual jam 15:00"

**Layer 2: Campaign Schedule (one-time)**
- "Kirim campaign 'Ramadan Special' tanggal 10 Maret jam 09:00"

**Layer 3: Auto Follow-up (already in spec)**
- "Kalau no reply dalam 4 hari, kirim follow-up template otomatis"

### Workspace Schedule Settings

Tiap workspace punya **default schedule** yang bisa di-set sekali:

```
🍱 TISKA CATERING - Schedule Settings

Mode: ⦿ Auto Daily Send  ◯ Manual Only

Send Window:
  Days: [Mon] [Tue] [Wed] [Thu] [Fri] (Sat & Sun off)
  Time: 09:00 - 11:00 WIB
  Daily target: 30 emails

Auto-fill source:
  ⦿ Pull dari "queue" yang udah lu setup (priority order)
  ◯ Pull random dari segment terpilih

Active queue: "Bogor HR - Cold Outreach Q2" (1,234 contacts pending)
Default template: "Cold Outreach Catering - Indonesian"

Next scheduled run: Besok 09:00 WIB → akan kirim 30 emails
```

```
📸 TETRA PHOTOBOOTH - Schedule Settings

Mode: ⦿ Auto Daily Send

Send Window:
  Days: [Mon] [Tue] [Wed] [Thu] [Fri]
  Time: 12:00 - 14:00 WIB ← lu request: lunch time
  Daily target: 20 emails

...
```

```
🎨 VISUAL TETRA - Schedule Settings

Mode: ⦿ Auto Daily Send (Warmup mode active)

Send Window:
  Days: [Mon] [Tue] [Wed] [Thu] [Fri]
  Time: 15:00 - 17:00 WIB ← lu request: sore
  Daily target: 5 emails (warmup, day 8/14)
  
Warmup ramp: Day 1-7: 5/day → Day 8-14: 10/day → Day 15+: 30/day
```

### Concept: "Send Queue" per Workspace

Daripada bikin "campaign" baru tiap hari (tedious), lu setup **queue** sekali:

**Queue = ordered list kontak yang akan dikirim secara bertahap.**

User experience:
1. Lu pilih segment: "Bogor HR yang belum pernah dikirim"
2. Pilih template: "Cold Outreach Catering"
3. Add ke queue: "Bogor HR Cold Outreach Q2"
4. Queue ada 1,234 contacts
5. Set schedule: 30/hari, Senin-Jumat, 09:00-11:00
6. **DONE.** Sistem otomatis kirim 30/hari sampai habis (~ 41 hari kerja)

Sehari-hari lu gak perlu apa-apa. Buka app cuma untuk:
- Cek dashboard (siapa yang reply)
- Reply manual via Gmail
- Sesekali pause/resume kalau ada event tertentu

### Schema Update

Tambahin tabel baru:

```sql
CREATE TABLE public.send_queues (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,                    -- "Bogor HR Cold Q2"
  template_id UUID REFERENCES public.templates(id),
  audience_filter JSONB NOT NULL,        -- saved filter snapshot
  
  -- Schedule
  is_active BOOLEAN DEFAULT true,
  schedule_days INTEGER[] DEFAULT '{1,2,3,4,5}', -- 1=Mon, 7=Sun
  schedule_start_time TIME DEFAULT '09:00',
  schedule_end_time TIME DEFAULT '11:00',
  daily_target INTEGER DEFAULT 30,
  
  -- Auto follow-up rules
  followup_enabled BOOLEAN DEFAULT false,
  followup_template_id UUID REFERENCES public.templates(id),
  followup_after_days INTEGER DEFAULT 4,
  
  -- AI personalization
  use_ai_opener BOOLEAN DEFAULT true,
  
  -- Stats
  total_in_queue INTEGER DEFAULT 0,
  total_sent INTEGER DEFAULT 0,
  total_pending INTEGER DEFAULT 0,
  
  -- Timestamps
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.queue_recipients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  queue_id UUID NOT NULL REFERENCES public.send_queues(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  
  status TEXT DEFAULT 'pending', -- pending, sent, replied, bounced, skipped
  scheduled_for_date DATE,
  priority INTEGER DEFAULT 0,
  
  sent_at TIMESTAMPTZ,
  campaign_recipient_id UUID, -- link ke campaign_recipients setelah dikirim
  
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(queue_id, contact_id)
);

CREATE INDEX idx_queue_recipients_queue ON public.queue_recipients(queue_id, status);
CREATE INDEX idx_queue_recipients_pending ON public.queue_recipients(status, scheduled_for_date) WHERE status = 'pending';
```

### Edge Function: queue-runner

Edge function baru yang jalan via pg_cron tiap 30 menit:

```typescript
// supabase/functions/queue-runner/index.ts

async function runQueues() {
  // 1. Get all active queues yang dalam send window saat ini
  const now = new Date();
  const currentTime = formatTime(now); // "09:23"
  const currentDay = now.getDay(); // 0-6
  
  const activeQueues = await db.send_queues.select(`
    SELECT * FROM send_queues
    WHERE is_active = true
      AND $1 = ANY(schedule_days)
      AND $2 BETWEEN schedule_start_time AND schedule_end_time
      AND total_pending > 0
  `, [currentDay, currentTime]);
  
  for (const queue of activeQueues) {
    // 2. Cek udah berapa email yang dikirim hari ini dari queue ini
    const sentToday = await db.queue_recipients.count({
      queue_id: queue.id,
      status: 'sent',
      sent_at: { gte: startOfDay(now) }
    });
    
    if (sentToday >= queue.daily_target) {
      continue; // hari ini quota udah terpenuhi
    }
    
    // 3. Hitung berapa yang harus dikirim dalam 30 menit ini
    const remainingForToday = queue.daily_target - sentToday;
    const minutesLeft = minutesBetween(now, queue.schedule_end_time);
    const intervalsLeft = Math.max(1, Math.floor(minutesLeft / 30));
    const sendThisInterval = Math.ceil(remainingForToday / intervalsLeft);
    
    // 4. Pick N pending recipients
    const recipients = await db.queue_recipients
      .select()
      .where({ queue_id: queue.id, status: 'pending' })
      .orderBy('priority', 'desc')
      .limit(sendThisInterval);
    
    // 5. Kirim satu per satu dengan delay
    for (const recipient of recipients) {
      try {
        // Generate AI opener kalau enabled
        let aiOpener = null;
        if (queue.use_ai_opener) {
          aiOpener = await generateAIOpener(recipient.contact_id, queue.workspace_id);
        }
        
        // Send email
        const result = await sendEmail({
          workspace_id: queue.workspace_id,
          contact_id: recipient.contact_id,
          template_id: queue.template_id,
          ai_opener: aiOpener
        });
        
        // Update status
        await db.queue_recipients.update(recipient.id, {
          status: 'sent',
          sent_at: new Date(),
          campaign_recipient_id: result.campaign_recipient_id
        });
        
        // Update queue stats
        await db.send_queues.update(queue.id, {
          total_sent: queue.total_sent + 1,
          total_pending: queue.total_pending - 1,
          last_run_at: new Date()
        });
        
        // Random delay 30-90 detik
        await sleep(randomBetween(30000, 90000));
        
        // Time budget check (Edge Function max 150s)
        if (timeElapsed > 120000) break;
        
      } catch (error) {
        await handleSendError(recipient, error);
      }
    }
  }
}
```

### Schedule via pg_cron

```sql
-- Run queue-runner every 30 minutes during business hours (08-18 WIB = 01-11 UTC)
SELECT cron.schedule(
  'queue-runner',
  '*/30 1-11 * * *',
  $$ SELECT net.http_post(
    url := 'https://[ref].supabase.co/functions/v1/queue-runner',
    headers := jsonb_build_object('Authorization', 'Bearer [SR-key]')
  ) $$
);
```

### UI Flow: Setup Queue

**Step 1: Pick Workspace** (lu udah di workspace Tiska misalnya)

**Step 2: Create Queue**
```
Buat Send Queue Baru

Nama: [Bogor HR Cold Outreach Q2______]

Pilih kontak:
⦿ Dari saved filter
   [▼ Bogor HR - Belum Pernah Dikirim (1,234 kontak)]
◯ Tag tertentu
◯ Manual select

Template email:
[▼ Cold Outreach Catering - Indonesian (Versi 2)]

✓ Pakai AI personalization (Gemini akan generate opener per kontak)

[Lanjut →]
```

**Step 3: Schedule Settings**
```
Kapan kirim?

Hari: ✓Sen ✓Sel ✓Rab ✓Kam ✓Jum ☐Sab ☐Min

Jam: [09:00] sampai [11:00] WIB

Berapa per hari: [30] email/hari

Estimasi selesai: 41 hari kerja (~ 8 minggu)

Auto follow-up?
✓ Ya, kalau gak balas dalam [4] hari
   Template: [▼ Follow-up #1 - Gentle Reminder]

[Buat Queue]
```

**Step 4: Confirmation**
```
✅ Queue "Bogor HR Cold Outreach Q2" dibuat!

Pengiriman pertama: Besok jam 09:00 WIB (30 emails)

[Lihat Queue] [Buat Queue Lain]
```

### Dashboard: Active Queues

Cross-workspace dashboard tampilin:
```
🤖 ACTIVE QUEUES

🍱 Tiska Catering
   "Bogor HR Cold Outreach Q2"
   Progress: 234/1,234 (19%) — ETA 33 hari kerja
   Today: 15/30 sent (running...)
   Schedule: Mon-Fri 09:00-11:00
   [Pause] [Edit] [View]

📸 Tetra Photobooth  
   "Wedding Vendor Q2"
   Progress: 89/567 (16%) — ETA 24 hari kerja
   Today: 0/20 (akan mulai 12:00)
   Schedule: Mon-Fri 12:00-14:00
   [Pause] [Edit] [View]

🎨 Visual Tetra
   "Design Agency Outreach"
   Progress: 23/200 (12%) — ETA 36 hari kerja
   Today: 0/5 (warmup mode, akan mulai 15:00)
   Schedule: Mon-Fri 15:00-17:00
   [Pause] [Edit] [View]
```

Lu bisa tutup app, semua jalan otomatis. Itu goal-nya.

## Gmail Integration: How Reply Works

Ini pertanyaan lu yang penting. Gua jelaskan jelas.

### Flow Email Outgoing (App ke Recipient)

```
[Lu di App]
    ↓ klik "Start Queue"
[App pakai Gmail API]
    ↓ kirim via catering.tiska@gmail.com
[Email masuk ke recipient]
    ↓
[Recipient buka di Gmail mereka]
```

Email yang dikirim TERLIHAT seperti dikirim langsung dari Gmail lu. Karena memang dikirim dari Gmail lu (via API). 100% legitimate, gak melalui server pihak ketiga.

### Flow Email Incoming (Recipient Reply ke Lu)

```
[Recipient klik Reply di Gmail mereka]
    ↓
[Email reply masuk ke INBOX catering.tiska@gmail.com]
    ↓
[Reply muncul di Gmail biasa lu]
```

**Reply masuk ke Gmail Inbox lu seperti biasa.** Gak ke aplikasi.

### Bagaimana App Tau Ada Reply?

App pakai Gmail API untuk **MEMBACA** inbox lu (read-only) tiap 15 menit. Sistem cek:
- Ada thread baru yang dibalas?
- Pengirim balasan adalah recipient yang ada di campaign?

Kalau ya → update status di app: "Bella Hs replied!"

Tapi **app gak nyimpen isi reply**, cuma flag "ada reply, cek Gmail".

### Cara Lu Reply ke Recipient

**Pilihan A: Reply via Gmail (RECOMMENDED)**

Ini cara paling natural. Lu reply seperti biasa di Gmail web/mobile app.

Flow:
1. Notifikasi di app: "🟣 Bella Hs replied!"
2. Klik notifikasi → buka Gmail di tab baru langsung ke thread itu
3. Lu reply di Gmail seperti biasa
4. Done

**Why ini better:**
- Familiar UI (Gmail)
- Full Gmail features (signature, formatting, attachment)
- Gak duplicate effort bikin email composer di app
- Reply lu masuk thread Gmail natural
- Recipient liat continuity (gak aneh)

**Pilihan B: Reply dari App (NOT recommended untuk MVP)**

App bisa secara teknis kirim reply via API. Tapi:
- Butuh bikin composer UI (effort dev)
- Gmail signature gak otomatis applied
- Format mungkin beda
- Lu tetep harus tracking di Gmail kalau replier balas lagi

**Verdict:** App fokus ke **outreach automation + tracking**. Reply tetep di Gmail. Best of both worlds.

### Dashboard Reply Management

Di app dashboard, ada section "Recent Replies":
```
💬 Recent Replies (perlu tindakan)

🟣 Bella Hs - Kreston Indonesia
   Reply ke: "Cold Outreach Catering"
   2 jam lalu
   [📧 Buka di Gmail]  [✓ Mark Handled]

🟣 Andi Surya - PT XYZ
   Reply ke: "Follow-up #1"
   5 jam lalu
   [📧 Buka di Gmail]  [✓ Mark Handled]
```

Klik "Buka di Gmail" → buka Gmail thread langsung. Lu reply manual di sana.

Klik "Mark Handled" → app update status, gak muncul lagi di list "perlu tindakan".

### Outbound Email di Gmail Sent Folder

Email yang dikirim app via Gmail API juga muncul di **Gmail Sent folder** lu otomatis (karena Gmail API yang kirim, jadi Gmail catat sebagai "sent by you").

Ini bagus karena:
- Lu punya record di Gmail (selain di app)
- Bisa search lewat Gmail kalau perlu
- Gak feel "third-party hijacking" akun lu

### Conversation Continuity

Kalau lu reply via Gmail manual, terus recipient balas lagi:
1. Reply mereka masuk Gmail inbox (thread sama)
2. App detect reply baru di thread itu
3. App update status: "Bella replied AGAIN" (counter +1)

Sistem track berapa kali tukeran message di thread, tapi gak nyimpen content.

### Privacy Boundary

App access ke Gmail terbatas via OAuth scopes:
- `gmail.send` — kirim email atas nama lu (cuma ini cara app jadi outreach tool)
- `gmail.readonly` — baca metadata thread (cuma untuk detect reply, bukan baca isi pesan)
- `gmail.modify` — apply label kalau perlu

App **gak baca isi email** lu yang lain. Cuma cek thread yang terkait campaign.

Lu bisa revoke akses kapan saja via myaccount.google.com/permissions.

### Visual Diagram

```
┌─────────────────┐         ┌────────────────┐
│   Cold Reach    │         │  Gmail (lu)    │
│   App (web)     │         │                │
└────────┬────────┘         └────────┬───────┘
         │                           │
         │  send via API             │
         ├──────────────────────────>│
         │                           │
         │                           │  email out
         │                           ├─────────> Recipient
         │                           │
         │                           │
         │                           │  reply in
         │                           │<───────── Recipient
         │                           │
         │  read thread (every 15min)│
         │<──────────────────────────│
         │                           │
         │  ── notify lu di dashboard│
         │                           │
         │                           │
   [Lu klik notif]                   │
         │                           │
         └─── buka Gmail thread ─────>│
                                     │
                              [Lu reply manual]
                                     │
                                     ├──────────> Recipient
```

## Workflow Realistis Lu Sehari-hari (Setelah App Jadi)

### Setup Phase (Hari 1, sekali)
1. Login app
2. Connect 3 Gmail accounts (Tiska, Photobooth, Visual)
3. Setup 3 workspace
4. Import 10K kontak dari Google Sheet
5. Import template dari Gmail drafts (atau buat baru)
6. Buat 3 send queue (1 per workspace)
7. Set schedule: Tiska pagi, Photobooth siang, Visual sore
8. Activate queues

**Total: 1-2 jam setup**

### Daily (Lu, 5 menit/hari)
- Pagi: cek dashboard, ada reply baru?
- Klik notif "Bella replied" → buka Gmail → reply
- Itu aja. Sistem kirim sendiri.

### Weekly (Lu, 30 menit)
- Senin: review performance minggu lalu
- Adjust queue kalau perlu (pause, ganti template)
- Tambah kontak baru ke queue kalau perlu

### Monthly (Lu, 1 jam)
- Refresh template (variasi)
- Review pipeline (mana yang stuck)
- Move kontak yang udah closing ke "won"
- Move kontak yang udah lama gak respond ke "lost" atau cold list

## Phase 1 (MVP) — Final Roadmap

Updated dari roadmap sebelumnya, simplified:

| Fase | Durasi | Deliverable |
|------|--------|-------------|
| 0 | 1-2 hari | Project setup (akun, repo, deploy) |
| 1 | 1-2 hari | Database schema + RLS |
| 2 | 1 hari | Auth + Login |
| 2.5 | 1 hari | Multi-workspace foundation |
| 3 | 3-4 hari | Contact CRUD + Import CSV + Filter |
| 4 | 2 hari | Templates + Variable + 1 PDF Attachment |
| 5 | 1-2 hari | Connect Gmail per workspace |
| 6 | 3 hari | **Send Queue + Schedule + Email Engine** ← yang lu request |
| 7 | 1 hari | AI Opener (Gemini integration) |
| 8 | 2 hari | Tracking (open + reply detection) |
| 9 | 1 hari | Auto Follow-up |
| 10 | 1 hari | Pipeline View per Workspace |
| 11 | 1-2 hari | Dashboard + Notifications |
| 12 | 1 hari | Polish, edge cases, deploy |

**Total: 20-25 hari kerja** (4-5 minggu kalau full-time, 8-12 minggu kalau sambilan)

Dengan vibe coding + Claude di Antigravity, bisa lebih cepet (30-50% reduction).

## What's NOT in MVP

Untuk save sanity dan ship:
- ❌ Click tracking detail (cuma open + reply)
- ❌ A/B testing canggih (cuma manual variation)
- ❌ Webhook integration
- ❌ Multi-user / team
- ❌ Custom domain support (akun Gmail aja)
- ❌ Email warm-up otomatis (manual setup)
- ❌ Drive integration (storage di Supabase aja)
- ❌ Export to Sheets (Phase 2)
- ❌ Mobile app native (web responsive cukup)

Semua bisa di-add Phase 2 setelah MVP usable dan validated.

## Summary

**Yang dibangun:** App cold email yang **kerja sendiri**.
- Lu setup sekali, sistem kirim otomatis tiap hari di jam yang lu set
- AI personalization gratis biar email gak generic
- Multi-workspace untuk 3 bisnis lu
- Reply masih lewat Gmail biasa (best UX)
- Tracking dan auto follow-up tetap jalan

**Yang lu lakukan harian:** 5 menit cek dashboard + reply via Gmail.

**Cost:** Rp 0/bulan.

**Effort build:** 20-25 hari kerja dengan Claude di Antigravity.

Ini realistis, achievable, dan sangat valuable untuk workflow lu. Stop brainstorm, mulai eksekusi. 🚀
