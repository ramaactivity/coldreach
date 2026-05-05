# 12 — Multi-Workspace Architecture

Dokumen ini detail arsitektur multi-workspace yang menjadi core dari aplikasi. Konsep ini fundamental, harus dipahami sebelum baca dokumen lain.

## 1. The Core Concept

Aplikasi mendukung **multi-business / multi-workspace** dalam satu user account. Satu user (Muhamad) menjalankan 3 bisnis yang independen tapi memakai aplikasi yang sama dengan database kontak yang dibagi.

### Mental model:

```
USER ACCOUNT (Muhamad)
│
├── SHARED LAYER (di user level)
│   ├── 📚 Contact Database (10K+ kontak, dishare semua workspace)
│   ├── 🏷️ Global Tags (region, industry, dll yang business-agnostic)
│   ├── 📋 Custom Fields (yang relevan untuk semua bisnis)
│   └── 🔍 Cross-workspace insights
│
└── WORKSPACES (di workspace level)
    │
    ├── 🍱 WORKSPACE: Tiska Catering
    │   ├── Email Account: catering.tiska@gmail.com
    │   ├── Templates (Tiska only)
    │   ├── Campaigns (Tiska only)
    │   ├── Pipeline Stages (Tiska-specific)
    │   ├── Saved Filters (Tiska only)
    │   ├── Workspace Tags (tiska:*)
    │   ├── Default Attachments (Tiska company profile PDF)
    │   ├── Email Signature (Tiska branding)
    │   └── Stats & Analytics (Tiska only)
    │
    ├── 📸 WORKSPACE: Tetra Photobooth
    │   └── (struktur sama, terpisah)
    │
    └── 🎨 WORKSPACE: Visual Tetra
        └── (struktur sama, terpisah)
```

## 2. Why This Architecture (vs Alternatives)

### Alternative 1: Multiple Accounts (1 user per business)
**Tolak.** User harus login 3 akun terpisah, database harus diduplikasi 3x. 30K total kontak, 3x quota, ribet management.

### Alternative 2: Shared Everything (1 workspace, multi sender)
**Tolak.** Template/campaign jadi rancu. Saat lihat list campaign, mixing Tiska dan Photobooth. Pipeline gak bisa beda. Reporting jadi messy.

### Alternative 3: Multi-Workspace dengan Shared Contact (CHOSEN) ✅
**Pilih.** Database kontak shared (efisien), tapi semua context bisnis (template, campaign, pipeline) terpisah per workspace. Best of both worlds.

## 3. Workspace Definition

Sebuah workspace memiliki:

### Identity
- `id` — UUID
- `user_id` — owner (untuk single-user app, ini = user.id)
- `name` — "Tiska Catering"
- `slug` — "tiska" (untuk URL: `/w/tiska/dashboard`)
- `description` — optional
- `logo_url` — optional, untuk branding di UI dan email signature
- `color_theme` — accent color untuk visual differentiation di sidebar
- `business_type` — catering, photography, design, consulting, dll
- `created_at`

### Configuration
- `email_account_id` — Gmail account yang dipakai workspace ini (1 workspace = 1 email account)
- `default_signature_html` — auto-append ke setiap email
- `default_attachment_ids` — array UUID, attachments yang auto-include
- `pipeline_stages` — JSONB array, definisi pipeline custom

### Pipeline Definition (per workspace)

Format JSONB di kolom `pipeline_stages`:
```json
[
  {
    "id": "new",
    "name": "Baru",
    "color": "#94a3b8",
    "order": 1,
    "is_default": true
  },
  {
    "id": "contacted",
    "name": "Sudah Dikontak",
    "color": "#3b82f6",
    "order": 2
  },
  {
    "id": "interested-tasting",
    "name": "Tertarik Food Tasting",
    "color": "#f59e0b",
    "order": 3
  },
  {
    "id": "tasting-scheduled",
    "name": "Tasting Terjadwal",
    "color": "#a855f7",
    "order": 4
  },
  {
    "id": "tasting-done",
    "name": "Tasting Selesai",
    "color": "#06b6d4",
    "order": 5
  },
  {
    "id": "quote-sent",
    "name": "Quote Dikirim",
    "color": "#0ea5e9",
    "order": 6
  },
  {
    "id": "won",
    "name": "Closed - Won",
    "color": "#22c55e",
    "order": 7,
    "is_terminal": true
  },
  {
    "id": "lost",
    "name": "Closed - Lost",
    "color": "#ef4444",
    "order": 8,
    "is_terminal": true
  }
]
```

User bisa edit pipeline stages via Settings → Workspace → Pipeline.

### Pre-loaded pipelines per business type:

**Catering pipeline (default untuk Tiska):**
```
Baru → Sudah Dikontak → Tertarik Food Tasting → Tasting Terjadwal 
→ Tasting Selesai → Quote Dikirim → Won/Lost
```

**Photobooth pipeline (default untuk Tetra Photobooth):**
```
Baru → Sudah Dikontak → Tanya Pricelist → Quote Dikirim 
→ Tanya Tersedia (Tanggal) → Kontrak Dikirim → Booked/Lost
```

**Visual Services pipeline (default untuk Visual Tetra):**
```
Baru → Sudah Dikontak → Tanya Portfolio → Brief Diterima 
→ Quote Dikirim → Won/Lost
```

User bisa customize sesuai kebutuhan.

## 4. Database Schema Changes

### 4.1 New Table: workspaces

```sql
CREATE TABLE public.workspaces (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  color_theme TEXT DEFAULT '#3b82f6',
  business_type TEXT,
  
  -- Configuration
  email_account_id UUID REFERENCES public.email_accounts(id) ON DELETE SET NULL,
  default_signature_html TEXT,
  default_attachment_ids UUID[] DEFAULT '{}',
  
  -- Pipeline definition
  pipeline_stages JSONB NOT NULL DEFAULT '[
    {"id":"new","name":"Baru","color":"#94a3b8","order":1,"is_default":true},
    {"id":"contacted","name":"Sudah Dikontak","color":"#3b82f6","order":2},
    {"id":"interested","name":"Tertarik","color":"#f59e0b","order":3},
    {"id":"won","name":"Closed - Won","color":"#22c55e","order":4,"is_terminal":true},
    {"id":"lost","name":"Closed - Lost","color":"#ef4444","order":5,"is_terminal":true}
  ]'::jsonb,
  
  -- Order in user's workspace list
  display_order INTEGER DEFAULT 0,
  is_archived BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(user_id, slug)
);

CREATE INDEX idx_workspaces_user ON public.workspaces(user_id) WHERE is_archived = false;

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own workspaces" ON public.workspaces
  FOR ALL USING (auth.uid() = user_id);
```

### 4.2 Update: email_accounts

Email account TETAP di user level (token milik user), tapi bisa di-assign ke workspace. Satu email account = satu workspace (1:1).

```sql
ALTER TABLE public.email_accounts 
  ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL;

-- One email account = one workspace
CREATE UNIQUE INDEX idx_one_account_per_workspace 
  ON public.email_accounts(workspace_id) WHERE workspace_id IS NOT NULL;
```

### 4.3 Update: templates

Templates jadi workspace-specific:

```sql
ALTER TABLE public.templates 
  ADD COLUMN workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE;

CREATE INDEX idx_templates_workspace ON public.templates(workspace_id);

-- RLS update
DROP POLICY "Users manage own templates" ON public.templates;
CREATE POLICY "Users manage own templates" ON public.templates
  FOR ALL USING (
    auth.uid() = user_id AND
    workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid())
  );
```

### 4.4 Update: campaigns

Sama, jadi workspace-specific:

```sql
ALTER TABLE public.campaigns 
  ADD COLUMN workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE;

CREATE INDEX idx_campaigns_workspace ON public.campaigns(workspace_id);
```

### 4.5 Update: tags

Tags bisa global (workspace_id NULL) atau workspace-specific:

```sql
ALTER TABLE public.tags 
  ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ADD COLUMN is_global BOOLEAN DEFAULT false;

-- Unique: same tag name allowed in different workspaces
DROP CONSTRAINT IF EXISTS tags_user_id_name_key;
ALTER TABLE public.tags 
  ADD CONSTRAINT tags_unique_per_scope 
  UNIQUE (user_id, COALESCE(workspace_id::text, 'global'), name);
```

### 4.6 Update: saved_filters

Per workspace:

```sql
ALTER TABLE public.saved_filters 
  ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
```

### 4.7 New Table: contact_workspace_data

Per-kontak data yang berbeda di tiap workspace (lead stage, notes per workspace, dll):

```sql
CREATE TABLE public.contact_workspace_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  
  -- Per-workspace lead stage
  lead_stage_id TEXT, -- references workspaces.pipeline_stages[].id
  lead_stage_updated_at TIMESTAMPTZ,
  
  -- Per-workspace notes
  workspace_notes TEXT,
  
  -- Per-workspace stats
  total_emails_sent INTEGER DEFAULT 0,
  total_emails_opened INTEGER DEFAULT 0,
  total_replies INTEGER DEFAULT 0,
  last_contacted_at TIMESTAMPTZ,
  last_replied_at TIMESTAMPTZ,
  
  -- Per-workspace status
  is_excluded BOOLEAN DEFAULT false, -- exclude this contact from this workspace's campaigns
  excluded_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(contact_id, workspace_id)
);

CREATE INDEX idx_contact_workspace_contact ON public.contact_workspace_data(contact_id);
CREATE INDEX idx_contact_workspace_workspace ON public.contact_workspace_data(workspace_id);
CREATE INDEX idx_contact_workspace_stage ON public.contact_workspace_data(workspace_id, lead_stage_id);

ALTER TABLE public.contact_workspace_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own contact workspace data" ON public.contact_workspace_data
  FOR ALL USING (auth.uid() = user_id);

-- Auto-create row saat kontak first interacted di workspace
CREATE OR REPLACE FUNCTION ensure_contact_workspace_data()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.contact_workspace_data (contact_id, workspace_id, user_id)
  VALUES (NEW.contact_id, 
          (SELECT workspace_id FROM campaigns WHERE id = NEW.campaign_id),
          NEW.user_id)
  ON CONFLICT (contact_id, workspace_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_recipient_created
  AFTER INSERT ON public.campaign_recipients
  FOR EACH ROW EXECUTE FUNCTION ensure_contact_workspace_data();
```

### 4.8 Contacts table: TETAP shared

Contacts tetap di user level. Field global tetap di sini (nama, email, company, dll).

Field yang per-workspace pindah ke `contact_workspace_data`:
- `lead_stage` (sebelumnya tunggal, sekarang per workspace)
- `total_emails_sent` (total per workspace)
- `last_contacted_at` (per workspace)

Tapi keep di contacts (untuk performance global aggregate):
- `total_emails_sent_all_workspaces` — sum semua workspace
- `last_contacted_at_any` — paling recent dari any workspace

## 5. URL Routing

URL pattern reflect workspace context:

```
/                                  → root, redirect ke last active workspace
/workspaces                        → list semua workspace, manage
/workspaces/new                    → create new workspace

/w/[slug]/dashboard                → dashboard workspace specific
/w/[slug]/contacts                 → list kontak (shared, tapi context workspace)
/w/[slug]/templates                → templates workspace
/w/[slug]/campaigns                → campaigns workspace
/w/[slug]/pipeline                 → kanban pipeline view workspace
/w/[slug]/settings                 → settings workspace

/contacts/[id]                     → contact detail, lihat data semua workspace
/settings/account                  → user-level settings (profile, email accounts)
/settings/contacts                 → user-level contact settings (custom fields, global tags)
```

Active workspace di-track via:
- URL slug (primary)
- `last_active_workspace_id` di user preferences (untuk redirect)

## 6. Workspace Switcher UI

Di sidebar atau topbar:

```
┌─────────────────────────┐
│ ColdReach               │
│ ─────────────────────── │
│ ┌──────────────────────┐│
│ │ 🍱 Tiska Catering  ▼ ││ ← Active workspace
│ └──────────────────────┘│
│                         │
│ 📊 Dashboard            │
│ 👥 Contacts (shared)    │ ← icon hint shared
│ 📝 Templates            │
│ 📤 Campaigns            │
│ 📋 Pipeline             │
│ ⚙️  Settings            │
│                         │
│ ─────────────────────── │
│ Quota: 23/50 today      │
└─────────────────────────┘
```

Klik dropdown:

```
┌──────────────────────────┐
│ ✓ 🍱 Tiska Catering      │ ← current
│   📸 Tetra Photobooth    │
│   🎨 Visual Tetra        │
│ ─────────────────────────│
│   ➕ Tambah Workspace    │
│   ⚙️  Manage Workspaces  │
└──────────────────────────┘
```

Klik workspace lain → instant context switch. Sidebar items, dashboard, semua refresh untuk workspace baru. Animasi smooth (300ms slide).

Color theme tiap workspace berbeda (tipis di sidebar accent), supaya user gak bingung sedang di mana:
- Tiska: warm orange tinge
- Photobooth: pink tinge
- Visual: purple tinge

## 7. Contacts View (Shared with Workspace Context)

Saat user di workspace Tiska, view `/w/tiska/contacts` menampilkan:

```
Contacts (10,234 total)
[+ Add Contact] [Import CSV] [Filter ▼] [Search ___________]

┌──────────────────────────────────────────────────────────────────┐
│ Filter chips: [region:bogor ×] [Tag: hr ×]   [12 selected]       │
└──────────────────────────────────────────────────────────────────┘

┌────┬─────────────┬─────────────────┬─────────┬──────────────────┐
│ ☐  │ Name        │ Company         │ Tiska Stage │ Last Email     │
├────┼─────────────┼─────────────────┼─────────┼──────────────────┤
│ ☐  │ Bella Hs    │ Kreston Indo    │ 🟠 Tertarik │ 19/03 ✓ replied│
│ ☐  │ Alif Al-F.  │ Kalibrr         │ 🔵 Contacted│ 12/03          │
│ ☐  │ Bandang S.  │ PT Drinkiss     │ 🔵 Contacted│ 12/03          │
│ ☐  │ ...         │ ...             │ ⚪ New      │ -              │
└────┴─────────────┴─────────────────┴─────────┴──────────────────┘
```

Penting:
- Kolom **"Tiska Stage"** menunjukkan stage di workspace Tiska saja
- Kolom **"Last Email"** dari workspace Tiska saja
- Filter "include from other workspaces" available, tapi default OFF

Ada toggle "Show all workspace activity" yang mengubah view jadi:
```
│ Bella Hs │ Kreston │ Tiska:Tertarik | Photobooth:- | Visual:- │ ...
```

### Contact Detail Page (full cross-workspace view)

Klik contact → `/contacts/[id]` (BUKAN workspace-scoped, supaya bisa lihat data semua workspace):

```
┌──────────────────────────────────────────────────────────────────┐
│ ← Kembali           Bella Hs                                      │
│                                                                   │
│ HR Manager - Kreston Indonesia                                   │
│ bella.hs@kreston.co.id                                           │
│ 📍 Bogor                                                          │
│ 🏷️ hr, corporate, priority-high                                   │
└──────────────────────────────────────────────────────────────────┘

┌─── Tiska Catering ──────────────────────────────────────────────┐
│ Stage: 🟠 Tertarik Food Tasting                                  │
│ Last contacted: 19 Mar 2026 (16 hari lalu)                       │
│ Total: 3 sent, 2 opened, 1 replied                               │
│                                                                   │
│ History:                                                          │
│ • 19 Mar — Email "Follow-up #1" — replied "Boleh kirim sample"   │
│ • 12 Mar — Email "Food Tasting Invitation" — opened              │
│ • 05 Mar — Email "Initial Outreach" — opened                     │
│                                                                   │
│ Notes (Tiska): "Tertarik untuk event akhir bulan, follow up tgl 25"│
│                                                                   │
│ [📧 Send Email] [📋 Move Stage] [✏️ Edit Notes]                  │
└──────────────────────────────────────────────────────────────────┘

┌─── Tetra Photobooth ────────────────────────────────────────────┐
│ Stage: ⚪ Belum dikontak                                          │
│ 💡 Suggestion: Kontak ini tertarik di Tiska, mungkin punya event │
│ kantor yang butuh photobooth juga.                                │
│                                                                   │
│ [📧 Send First Email]                                             │
└──────────────────────────────────────────────────────────────────┘

┌─── Visual Tetra ────────────────────────────────────────────────┐
│ Stage: ⚪ Belum dikontak                                          │
│                                                                   │
│ [📧 Send First Email]                                             │
└──────────────────────────────────────────────────────────────────┘
```

Powerful banget. Lu bisa lihat full picture per kontak.

## 8. Cross-Workspace Anti-Flood Protection

Karena kontak shared, ada risk: user accidentally blast kontak yang sama dari 3 bisnis dalam waktu dekat. Recipient annoyed.

### Protection layers:

**Layer 1: Soft warning saat campaign create**
```
⚠️ 234 dari 500 kontak target Anda sudah menerima email dari workspace lain dalam 7 hari terakhir.

Detail:
• 145 kontak: dapat email dari Tiska Catering (3-7 hari lalu)
• 67 kontak: dapat email dari Tetra Photobooth (1-7 hari lalu)
• 22 kontak: dari kedua workspace

Pilihan:
[ ] Kirim ke semua (tidak rekomendasi)
[✓] Skip yang dapat email dari workspace lain dalam 7 hari (rekomendasi)
[ ] Custom: jeda > X hari
```

**Layer 2: Configurable cross-workspace cooldown**
Di Settings → User Account:
```
Cross-Workspace Email Frequency:
Minimal jeda antar email ke kontak yang sama (dari workspace berbeda):
[Slider: 0 - 14 hari]  Default: 5 hari
```

**Layer 3: Per-contact opt-out**
User bisa exclude kontak tertentu dari workspace tertentu:
- Contact detail → Tetra Photobooth section → "Exclude from this workspace"
- Reason: "Sudah jadi client Tiska, skip Photobooth outreach"

**Layer 4: Smart suggestions (Phase 2)**
```
💡 Insight: Bella Hs sudah replied di Tiska Catering. Kemungkinan dia siap untuk
upsell. Mau bikin campaign cross-sell Photobooth khusus untuk client Tiska?
```

## 9. Email Account ↔ Workspace Binding

Per jawaban user, model-nya **1 email account = 1 workspace** (strict).

### Saat connect email account:
1. User OAuth flow Gmail
2. Setelah connect, force assign ke workspace:
   ```
   Email "catering.tiska@gmail.com" connected.
   Assign to which workspace?
   ◯ 🍱 Tiska Catering
   ◯ 📸 Tetra Photobooth
   ◯ 🎨 Visual Tetra
   ◯ ➕ Create New Workspace
   ```
3. Save binding di `email_accounts.workspace_id`

### Validation:
- Workspace TANPA email account = read-only mode (gak bisa kirim campaign)
- Email account tanpa workspace = orphan, harus di-assign atau diputus

### Reassign:
- User bisa reassign account ke workspace lain via Settings
- Warning: "Memindahkan akun ini akan mengubah default sender untuk campaign baru di workspace X"

## 10. Workspace-Level Templates

Setiap workspace punya template library sendiri.

### Template structure (updated):
```sql
templates {
  workspace_id, -- NEW
  name,
  category,
  subject_lines[],
  body_html,
  body_plain,
  attachments[],
  ...
}
```

### UX:
- Di workspace Tiska, user lihat template Tiska saja
- Tombol "Copy from another workspace" untuk duplicate template antar workspace
- Starter templates auto-seed per business type:
  - Workspace catering → 5 starter Tiska templates
  - Workspace photobooth → 5 starter photobooth templates
  - Workspace design → 5 starter design templates

## 11. Workspace-Level Campaigns & Pipeline

Sama seperti templates, campaigns dan pipeline tracking terpisah.

### Campaign cross-workspace prevention:
Saat create campaign, sender wajib dari email account yang assigned ke workspace ini. Gak bisa pilih sender dari workspace lain.

### Pipeline kanban (per workspace):
```
[Workspace: Tiska Catering]

🆕 Baru          🔵 Contacted    🟠 Tertarik     🟣 Tasting Sched  🟢 Won  🔴 Lost
   234              45              12                3              45      12

[Drag-drop kontak antar stage]
[+ Add to stage]
```

User bisa edit pipeline definition: rename, reorder, add, remove stages.

## 12. Onboarding Flow Multi-Workspace

Saat first-time setup, wizard multi-workspace:

### Step 1: Welcome
"Hai Muhamad! Berapa bisnis yang Anda kelola?"
- 1 bisnis → flow simple, langsung create 1 workspace
- 2-3 bisnis → multi-workspace flow

### Step 2: Setup Workspaces
"Beritahu kami bisnis Anda"

Form input multi-row:
```
Workspace 1:
- Nama: [Tiska Catering        ]
- Slug: [tiska                  ]
- Tipe: [Catering        ▼]
- Color: [🟠 Orange       ▼]

Workspace 2:
- Nama: [Tetra Photobooth      ]
- Slug: [photobooth             ]
- Tipe: [Photography     ▼]
- Color: [🔵 Pink         ▼]

Workspace 3:
- Nama: [Visual Tetra          ]
- Slug: [visual                 ]
- Tipe: [Design          ▼]
- Color: [🟣 Purple       ▼]

[+ Tambah Workspace]
[Lanjut →]
```

### Step 3: Connect Gmail per Workspace
Untuk setiap workspace:
"Connect Gmail untuk Tiska Catering"
→ OAuth flow
→ "Connect Gmail untuk Tetra Photobooth"
→ OAuth flow
→ "Connect Gmail untuk Visual Tetra"
→ OAuth flow
(skip-able, bisa connect later)

### Step 4: Per-Workspace Setup
Untuk tiap workspace yang udah connect Gmail:
- Upload logo (optional)
- Buat signature
- Upload default attachment
- Pilih pipeline template (catering/photo/design preset)
- Customize stages kalau perlu

### Step 5: Import Contacts (Shared)
"Import database kontak. Database ini akan dishare semua workspace."
→ Upload CSV
→ Mapping
→ Confirm

### Step 6: Migrate dari Sistem Lama (Tiska context)
Khusus untuk founding user:
"Detect Gmail labels: Tertarik Food Tasting, Pitching, dll"
→ "Mapping ke pipeline stage Tiska Catering?"
→ Auto-suggest mapping
→ Apply

### Step 7: First Campaign per Workspace (optional)
"Mau bikin campaign pertama untuk salah satu workspace?"
→ Suggest campaign per workspace yang udah ready

## 13. Settings Hierarchy

Karena ada 2 level (user dan workspace), settings juga bertingkat.

### User-Level Settings: `/settings/account`
- Profile (nama, foto)
- Connected email accounts (semua, view all)
- Custom fields (untuk contacts, shared semua workspace)
- Global tags
- Cross-workspace preferences (cooldown, etc)
- Privacy & data
- Language, timezone

### Workspace-Level Settings: `/w/[slug]/settings`
- Workspace info (nama, logo, color)
- Email account binding
- Default signature
- Default attachments
- Pipeline stages (CRUD)
- Workspace-specific tags
- Saved filters
- Sending defaults (quota, delay, send window)
- Anti-spam rules per workspace

### Switcher UX:
Di Settings page, ada tab/segment:
```
[👤 Account Settings] [🍱 Tiska Settings] [📸 Photobooth Settings] [🎨 Visual Settings]
```

## 14. Dashboard Hierarchy

### Per-Workspace Dashboard: `/w/[slug]/dashboard`
KPI dan activity untuk workspace ini saja:
- Today's quota (Tiska)
- This week sent/opened/replied (Tiska)
- Top template (Tiska)
- Pipeline overview (Tiska)
- Recent activity (Tiska)

### Cross-Workspace Dashboard: `/dashboard` atau `/`
Aggregate view semua workspace:
```
┌────────────────────────────────────────────┐
│ Today's Activity                           │
├────────────────────────────────────────────┤
│ 🍱 Tiska:    23/50 sent, 5 opened, 1 reply │
│ 📸 Photoboooth: 12/30 sent, 3 opened, 0     │
│ 🎨 Visual:   3/15 sent (warmup), 0, 0       │
│ ────────────────────────────────────────── │
│ Total:      38/95 sent, 8 opened, 1 reply  │
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│ Suggestions                                │
├────────────────────────────────────────────┤
│ 💡 5 contact replied di Tiska minggu ini.  │
│    Mungkin saatnya cross-sell Photobooth?  │
│                                             │
│ ⏰ 12 contact perlu follow-up di Photobooth │
│                                             │
│ ⚠️ Visual Tetra: 3 dari 15 quota dipakai.   │
│    Masih warmup, jangan buru-buru.          │
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│ Quick Actions                              │
├────────────────────────────────────────────┤
│ [→ Tiska Dashboard]                         │
│ [→ Photobooth Dashboard]                    │
│ [→ Visual Dashboard]                        │
│ [+ Create Campaign]                         │
└────────────────────────────────────────────┘
```

## 15. Quota Management

### Per-account quota tracking
Setiap email account punya `daily_quota` dan `emails_sent_today`. Tetap.

### Per-workspace view
Karena 1 workspace = 1 email account, quota workspace = quota email account-nya.

### User-level aggregate
Total quota = sum semua connected account.

### Display strategy:
- Di workspace dashboard: quota workspace itu saja
- Di global dashboard: aggregate semua
- Di campaign create: quota workspace context (yang relevan)

## 16. Implementation Priority

### Must have di MVP (Phase 1):
1. Multi-workspace creation
2. Workspace switcher UI
3. URL routing /w/[slug]/*
4. Email account ↔ workspace binding
5. Templates per workspace
6. Campaigns per workspace
7. Pipeline stages per workspace
8. Contact view dengan workspace context
9. Cross-workspace anti-flood (basic version: hard cooldown)

### Phase 2:
- Cross-workspace insights & suggestions
- Smart cross-sell recommendations
- Per-contact workspace exclusion (opt-out granular)
- Cross-workspace campaign template (bikin campaign mirror untuk multiple workspace)

### Phase 3:
- Workspace templates marketplace (share template antar user)
- Multi-user workspace (kalau lu tambah team member)

## 17. Migration from Single-User Mental Model

User yang udah biasa pikir "1 user = 1 bisnis" mungkin confused awal-awal. Edukasi via:

1. **Onboarding wizard** yang clearly explain konsep workspace
2. **Tooltip di workspace switcher**: "Setiap workspace adalah 'bisnis' Anda dengan template, campaign, dan pipeline terpisah"
3. **Empty state di workspace baru**: gambaran apa yang ada di sini, dengan illustrasi
4. **Help center article**: "Apa itu Workspace? Kapan harus bikin yang baru?"

## 18. Edge Cases

### Edge Case 1: Email account dipindah workspace
Misal `tetraphotobooth@gmail.com` dipindah dari workspace "Photobooth" ke workspace "Catering" (skenario aneh, tapi perlu di-handle):
- Campaign yang udah di-trigger pakai akun ini, tetap selesai
- Campaign baru pakai context workspace baru
- Warning ke user

### Edge Case 2: Workspace di-delete
- Soft delete (mark archived)
- Email account jadi orphan, harus di-reassign atau diputus
- Templates, campaigns, dll ikut archived
- Contacts TIDAK ke-delete (shared)
- Contact_workspace_data records di-archive (data riwayat tetap accessible read-only)

### Edge Case 3: Kontak di-delete sementara active di workspace lain
- Contact soft delete (deleted_at)
- Contact_workspace_data semua workspace tetap, tapi contact reference shows "deleted contact"
- Campaign yang in-progress yang nge-target kontak ini, skip kontak ini

### Edge Case 4: Same email di-add 2 workspace simultaneously
- Email kontak unique per user, jadi auto-merge (gak duplicate)
- Contact_workspace_data dibuat untuk masing-masing workspace
- User notification: "Kontak X sudah ada, dishare otomatis"

### Edge Case 5: User punya email account yang shared antar bisnis (skenario alternatif)
Skenario: lu pakai `info@tetragroup.com` untuk semua bisnis (theoretically)
- Solusi: gak diizinkan di MVP. 1 account = 1 workspace strict.
- Phase 2 bisa support shared account dengan persona/alias

## 19. Workspace Limits (Free Tier)

Untuk free tier safety:
- **Max 5 workspace per user** (cukup untuk most case)
- **Max 5 email account total per user**
- **Setting recommendation:**
  - Tiska: dedicated workspace + akun
  - Photobooth: dedicated workspace + akun
  - Visual: dedicated workspace + akun
  - Slot remaining buat future expansion

User bisa archive workspace lama untuk free up slot.

## 20. Naming Convention Recap

Penting untuk konsistensi terminology di app dan docs:

- **Account / User** = login identity (email Muhamad)
- **Workspace** = business context (Tiska, Photobooth, Visual)
- **Email Account / Sender Account** = Gmail untuk kirim email (assigned ke workspace)
- **Contact** = lead/prospek (shared across workspaces)
- **Pipeline Stage** = lifecycle status per workspace
- **Tag** = label, bisa global atau workspace-specific

Avoid confusing terms:
- ❌ "Multi-account" (ambiguous: user account vs email account)
- ❌ "Profile" (ambiguous: user profile vs workspace branding)
- ✅ "Workspace" (clear, modern, familiar dari Slack/Notion)
