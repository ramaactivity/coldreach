# 04 — Database Schema

Schema lengkap PostgreSQL untuk Supabase. Termasuk RLS policies, indexes, dan triggers.

## Convention

- Semua table pake `id UUID DEFAULT gen_random_uuid() PRIMARY KEY`
- Semua punya `created_at TIMESTAMPTZ DEFAULT now()`
- Soft delete via `deleted_at TIMESTAMPTZ`
- Foreign key cascade delete kalau memang harus hilang bersama parent
- Kolom JSON pake `jsonb`, bukan `json`
- Kolom array pake native PG array

## 1. users

Extension dari `auth.users` Supabase. Auto-created via trigger.

```sql
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  default_signature TEXT,
  preferences JSONB DEFAULT '{
    "default_daily_quota": 30,
    "default_send_window_start": "09:00",
    "default_send_window_end": "17:00",
    "default_skip_weekend": true,
    "default_min_delay_seconds": 30,
    "default_max_delay_seconds": 90,
    "timezone": "Asia/Jakarta"
  }'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own profile" ON public.users
  FOR ALL USING (auth.uid() = id);

-- Trigger to auto-create user record on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

## 2. email_accounts

Gmail accounts yang user connect untuk pengiriman.

```sql
CREATE TABLE public.email_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  daily_quota INTEGER DEFAULT 30,
  emails_sent_today INTEGER DEFAULT 0,
  quota_reset_at TIMESTAMPTZ DEFAULT now(),
  health_status TEXT DEFAULT 'healthy', -- healthy, warning, blocked, needs_reconnect
  health_notes TEXT,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, email)
);

CREATE INDEX idx_email_accounts_user ON public.email_accounts(user_id);
CREATE INDEX idx_email_accounts_active ON public.email_accounts(is_active) WHERE is_active = true;

ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own email accounts" ON public.email_accounts
  FOR ALL USING (auth.uid() = user_id);

-- Only one default per user
CREATE UNIQUE INDEX idx_one_default_per_user
  ON public.email_accounts(user_id) WHERE is_default = true;
```

## 3. contacts

Database kontak.

```sql
CREATE TABLE public.contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  company TEXT,
  position TEXT,
  phone TEXT,
  website TEXT,
  notes TEXT,
  custom_fields JSONB DEFAULT '{}'::jsonb,
  tags TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'active', -- active, unsubscribed, blocked, bounced
  source TEXT, -- csv_import, manual, api
  last_contacted_at TIMESTAMPTZ,
  total_emails_sent INTEGER DEFAULT 0,
  total_emails_opened INTEGER DEFAULT 0,
  total_replies INTEGER DEFAULT 0,
  unsubscribe_token TEXT UNIQUE DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(user_id, email)
);

-- Critical indexes for filtering
CREATE INDEX idx_contacts_user ON public.contacts(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_status ON public.contacts(user_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_tags ON public.contacts USING GIN(tags);
CREATE INDEX idx_contacts_email ON public.contacts(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_unsubscribe_token ON public.contacts(unsubscribe_token);
CREATE INDEX idx_contacts_search ON public.contacts USING GIN(
  to_tsvector('english',
    coalesce(first_name, '') || ' ' ||
    coalesce(last_name, '') || ' ' ||
    coalesce(email, '') || ' ' ||
    coalesce(company, '')
  )
);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own contacts" ON public.contacts
  FOR ALL USING (auth.uid() = user_id);
```

## 4. tags

Daftar tag user-defined dengan metadata.

```sql
CREATE TABLE public.tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);

CREATE INDEX idx_tags_user ON public.tags(user_id);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tags" ON public.tags
  FOR ALL USING (auth.uid() = user_id);
```

## 5. custom_fields_definitions

Definisi custom fields per user.

```sql
CREATE TABLE public.custom_fields_definitions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL, -- snake_case, used as key in custom_fields jsonb
  display_name TEXT NOT NULL,
  field_type TEXT DEFAULT 'text', -- text, number, date, url, select
  options JSONB, -- untuk type 'select'
  is_required BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, field_key)
);

ALTER TABLE public.custom_fields_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own custom fields" ON public.custom_fields_definitions
  FOR ALL USING (auth.uid() = user_id);
```

## 6. templates

Template email.

```sql
CREATE TABLE public.templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  subject_lines TEXT[] NOT NULL DEFAULT '{}', -- multiple for A/B testing
  body_html TEXT NOT NULL,
  body_plain TEXT NOT NULL,
  variables_used TEXT[] DEFAULT '{}', -- auto-detected
  is_starter BOOLEAN DEFAULT false, -- seeded templates
  times_used INTEGER DEFAULT 0,
  avg_open_rate FLOAT,
  avg_reply_rate FLOAT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_templates_user ON public.templates(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_templates_category ON public.templates(user_id, category) WHERE deleted_at IS NULL;

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own templates" ON public.templates
  FOR ALL USING (auth.uid() = user_id);
```

## 7. campaigns

Campaign / kampanye pengiriman bulk.

```sql
CREATE TABLE public.campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email_account_id UUID NOT NULL REFERENCES public.email_accounts(id),
  template_id UUID REFERENCES public.templates(id) ON DELETE SET NULL,

  -- Snapshot template content saat campaign dibuat (kalau template dihapus)
  template_subject_lines TEXT[] NOT NULL,
  template_body_html TEXT NOT NULL,
  template_body_plain TEXT NOT NULL,

  -- Settings
  daily_quota INTEGER DEFAULT 30,
  min_delay_seconds INTEGER DEFAULT 30,
  max_delay_seconds INTEGER DEFAULT 90,
  send_window_start TIME DEFAULT '09:00',
  send_window_end TIME DEFAULT '17:00',
  skip_weekend BOOLEAN DEFAULT true,
  scheduled_start_at TIMESTAMPTZ,

  -- Follow-up rules
  followup_enabled BOOLEAN DEFAULT false,
  followup_rules JSONB DEFAULT '[]'::jsonb,
  -- Format: [{ template_id, days_after, condition: 'no_reply' | 'no_open' }]

  -- Stats (denormalized for fast dashboard)
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  opened_count INTEGER DEFAULT 0,
  replied_count INTEGER DEFAULT 0,
  bounced_count INTEGER DEFAULT 0,
  unsubscribed_count INTEGER DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'draft', -- draft, scheduled, running, paused, completed, failed
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_campaigns_user ON public.campaigns(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_campaigns_status ON public.campaigns(status) WHERE deleted_at IS NULL;

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own campaigns" ON public.campaigns
  FOR ALL USING (auth.uid() = user_id);
```

## 8. campaign_recipients

Per-kontak status dalam campaign. Ini tabel paling banyak rownya.

```sql
CREATE TABLE public.campaign_recipients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, -- denormalized for RLS perf

  -- Snapshot contact data (in case contact deleted later)
  contact_email TEXT NOT NULL,

  -- Send details
  status TEXT DEFAULT 'pending', -- pending, sending, sent, delivered, opened, replied, bounced, unsubscribed, failed
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,

  -- Gmail metadata
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  gmail_subject_used TEXT, -- which subject from variants
  rendered_body_html TEXT, -- snapshot of what was actually sent

  -- Tracking
  open_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,

  -- Error
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(campaign_id, contact_id)
);

CREATE INDEX idx_recipients_campaign ON public.campaign_recipients(campaign_id);
CREATE INDEX idx_recipients_contact ON public.campaign_recipients(contact_id);
CREATE INDEX idx_recipients_user ON public.campaign_recipients(user_id);
CREATE INDEX idx_recipients_status ON public.campaign_recipients(status, campaign_id);
CREATE INDEX idx_recipients_thread ON public.campaign_recipients(gmail_thread_id) WHERE gmail_thread_id IS NOT NULL;
CREATE INDEX idx_recipients_pending ON public.campaign_recipients(status, scheduled_at) WHERE status = 'pending';

ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own recipients" ON public.campaign_recipients
  FOR ALL USING (auth.uid() = user_id);
```

## 9. followup_history

Log follow-up emails sent.

```sql
CREATE TABLE public.followup_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_recipient_id UUID NOT NULL REFERENCES public.campaign_recipients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  followup_step INTEGER NOT NULL, -- 1, 2, 3
  template_id UUID REFERENCES public.templates(id),
  gmail_message_id TEXT,
  sent_at TIMESTAMPTZ DEFAULT now(),
  opened_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ
);

CREATE INDEX idx_followup_recipient ON public.followup_history(campaign_recipient_id);

ALTER TABLE public.followup_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own followups" ON public.followup_history
  FOR ALL USING (auth.uid() = user_id);
```

## 10. send_jobs

Queue untuk background workers.

```sql
CREATE TABLE public.send_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending', -- pending, running, completed, failed
  job_type TEXT DEFAULT 'campaign_send', -- campaign_send, followup_send
  priority INTEGER DEFAULT 0,
  picked_up_at TIMESTAMPTZ,
  picked_up_by TEXT, -- worker instance id
  completed_at TIMESTAMPTZ,
  error TEXT,
  retry_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_jobs_pending ON public.send_jobs(status, priority DESC, created_at)
  WHERE status = 'pending';

-- No RLS, only service role accesses
```

## 11. activity_log

Recent activity untuk feed dashboard.

```sql
CREATE TABLE public.activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL, -- email_sent, email_opened, email_replied, etc
  entity_type TEXT, -- campaign, contact, template
  entity_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_activity_user_time ON public.activity_log(user_id, created_at DESC);

-- Auto cleanup: keep only last 30 days
-- Run via pg_cron daily

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own activity" ON public.activity_log
  FOR SELECT USING (auth.uid() = user_id);
```

## 12. saved_filters

Saved filter views untuk kontak.

```sql
CREATE TABLE public.saved_filters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filter_definition JSONB NOT NULL,
  -- Format: { tags: [], status: 'active', custom_field_filters: [...], etc }
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.saved_filters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own filters" ON public.saved_filters
  FOR ALL USING (auth.uid() = user_id);
```

## 13. email_events (Optional Phase 2)

Granular event log untuk analytics lebih detail.

```sql
CREATE TABLE public.email_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_recipient_id UUID NOT NULL REFERENCES public.campaign_recipients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- sent, delivered, opened, clicked, replied, bounced, unsubscribed
  event_data JSONB DEFAULT '{}'::jsonb,
  user_agent TEXT,
  ip_hash TEXT, -- hashed for privacy
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_events_recipient ON public.email_events(campaign_recipient_id);
CREATE INDEX idx_events_user_time ON public.email_events(user_id, created_at DESC);
```

## Triggers & Functions

### Auto-update updated_at
```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- repeat for each table
```

### Auto-update campaign stats
```sql
CREATE OR REPLACE FUNCTION update_campaign_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
    -- Increment counters based on new status
    IF NEW.status = 'sent' THEN
      UPDATE public.campaigns SET sent_count = sent_count + 1 WHERE id = NEW.campaign_id;
    ELSIF NEW.status = 'opened' AND OLD.status != 'replied' THEN
      UPDATE public.campaigns SET opened_count = opened_count + 1 WHERE id = NEW.campaign_id;
    ELSIF NEW.status = 'replied' THEN
      UPDATE public.campaigns SET replied_count = replied_count + 1 WHERE id = NEW.campaign_id;
    ELSIF NEW.status = 'bounced' THEN
      UPDATE public.campaigns SET bounced_count = bounced_count + 1 WHERE id = NEW.campaign_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_recipient_status_change
  AFTER UPDATE OF status ON public.campaign_recipients
  FOR EACH ROW EXECUTE FUNCTION update_campaign_stats();
```

### Reset daily quota
```sql
-- Run via pg_cron daily at 00:00 user timezone
CREATE OR REPLACE FUNCTION reset_daily_quotas()
RETURNS void AS $$
BEGIN
  UPDATE public.email_accounts
  SET emails_sent_today = 0,
      quota_reset_at = now()
  WHERE quota_reset_at < now() - interval '24 hours';
END;
$$ LANGUAGE plpgsql;

SELECT cron.schedule('reset-daily-quotas', '0 0 * * *', 'SELECT reset_daily_quotas()');
```

## Estimated Storage

Untuk 1 user dengan:
- 5,000 contacts: ~ 2 MB
- 50 campaigns dengan rata-rata 100 recipients: 5,000 recipients × 2KB = 10 MB
- 100 templates: 1 MB
- Activity log 30 hari: 5 MB
- Total: ~ 20 MB per active user

Free tier 500MB → muat ~ 20-25 active users. Cukup buat MVP.

## Migration Order

1. Enable extensions (pgcrypto, pg_cron)
2. Create users table + trigger
3. Create email_accounts
4. Create tags, custom_fields_definitions
5. Create contacts
6. Create templates
7. Create campaigns
8. Create campaign_recipients (depends on campaigns + contacts)
9. Create followup_history
10. Create send_jobs (no RLS)
11. Create activity_log
12. Create saved_filters
13. Create email_events (optional)
14. Apply triggers
15. Schedule cron jobs
16. Seed starter templates
