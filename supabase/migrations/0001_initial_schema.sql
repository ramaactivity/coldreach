-- =============================================================================
-- ColdReach — Initial Schema
-- File: 0001_initial_schema.sql
-- Created: 2026-05-05
--
-- This migration creates all 17 core tables for the cold email automation app.
-- Run order matters: tables are listed in dependency order.
--
-- After running this, also run 0002_storage.sql for the attachments bucket.
-- =============================================================================


-- =============================================================================
-- EXTENSIONS
-- =============================================================================
-- pgcrypto: gen_random_uuid() for primary keys
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Note: pg_cron is enabled separately via Supabase dashboard
-- (Database → Extensions → enable "pg_cron"). Used in Fase 6 for queue runner.


-- =============================================================================
-- HELPER FUNCTION: auto-update updated_at
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- 1. USERS — extends auth.users
-- =============================================================================
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
    "timezone": "Asia/Jakarta",
    "cross_workspace_cooldown_days": 5
  }'::jsonb,
  last_active_workspace_id UUID,  -- FK added later (forward ref)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own profile"
  ON public.users FOR ALL
  USING (auth.uid() = id);

CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create users row when auth.users row inserted
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- =============================================================================
-- 2. WORKSPACES — multi-business support (Tiska, Photobooth, Visual)
-- =============================================================================
CREATE TABLE public.workspaces (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  color_theme TEXT DEFAULT '#3b82f6',
  business_type TEXT,  -- catering, photography, design, etc.

  -- Configuration
  default_signature_html TEXT,
  default_attachment_ids UUID[] DEFAULT '{}',

  -- Pipeline definition (custom per workspace)
  pipeline_stages JSONB NOT NULL DEFAULT '[
    {"id":"new","name":"Baru","color":"#94a3b8","order":1,"is_default":true},
    {"id":"contacted","name":"Sudah Dikontak","color":"#3b82f6","order":2},
    {"id":"interested","name":"Tertarik","color":"#f59e0b","order":3},
    {"id":"won","name":"Closed - Won","color":"#22c55e","order":4,"is_terminal":true},
    {"id":"lost","name":"Closed - Lost","color":"#ef4444","order":5,"is_terminal":true}
  ]'::jsonb,

  -- Schedule defaults (per workspace, applied to send_queues)
  schedule_days INTEGER[] DEFAULT '{1,2,3,4,5}',  -- Mon-Fri
  schedule_start_time TIME DEFAULT '09:00',
  schedule_end_time TIME DEFAULT '17:00',
  daily_target INTEGER DEFAULT 30,

  -- Display
  display_order INTEGER DEFAULT 0,
  is_archived BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, slug)
);

CREATE INDEX idx_workspaces_user
  ON public.workspaces(user_id) WHERE is_archived = false;

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own workspaces"
  ON public.workspaces FOR ALL
  USING (auth.uid() = user_id);

CREATE TRIGGER set_workspaces_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Now we can add forward FK from users.last_active_workspace_id
ALTER TABLE public.users
  ADD CONSTRAINT fk_users_last_active_workspace
  FOREIGN KEY (last_active_workspace_id)
  REFERENCES public.workspaces(id) ON DELETE SET NULL;


-- =============================================================================
-- 3. EMAIL_ACCOUNTS — Gmail OAuth tokens, 1:1 with workspace
-- =============================================================================
CREATE TABLE public.email_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,

  email TEXT NOT NULL,
  display_name TEXT,
  business_name TEXT,           -- "Tiska Catering"

  -- OAuth tokens (encrypted at app level before write)
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  oauth_scope TEXT,             -- granted scopes

  -- Quota & health
  is_active BOOLEAN DEFAULT true,
  daily_quota INTEGER DEFAULT 30,
  emails_sent_today INTEGER DEFAULT 0,
  quota_reset_at TIMESTAMPTZ DEFAULT now(),
  health_status TEXT DEFAULT 'healthy',  -- healthy, warning, blocked, needs_reconnect
  health_notes TEXT,

  -- Warmup mode (for new accounts < 90 days)
  warmup_mode BOOLEAN DEFAULT false,
  warmup_started_at TIMESTAMPTZ,

  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, email)
);

CREATE INDEX idx_email_accounts_user
  ON public.email_accounts(user_id);

CREATE INDEX idx_email_accounts_active
  ON public.email_accounts(is_active) WHERE is_active = true;

-- One email account = one workspace (strict, per spec)
CREATE UNIQUE INDEX idx_one_account_per_workspace
  ON public.email_accounts(workspace_id) WHERE workspace_id IS NOT NULL;

ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own email accounts"
  ON public.email_accounts FOR ALL
  USING (auth.uid() = user_id);

CREATE TRIGGER set_email_accounts_updated_at
  BEFORE UPDATE ON public.email_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 4. TAGS — global or workspace-scoped
-- =============================================================================
CREATE TABLE public.tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  is_global BOOLEAN DEFAULT false,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tags_user ON public.tags(user_id);
CREATE INDEX idx_tags_workspace ON public.tags(workspace_id) WHERE workspace_id IS NOT NULL;

-- Unique per scope: same name allowed in different workspaces, OR one global per name
CREATE UNIQUE INDEX idx_tags_unique_per_scope
  ON public.tags(user_id, COALESCE(workspace_id::text, 'global'), name);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own tags"
  ON public.tags FOR ALL
  USING (auth.uid() = user_id);


-- =============================================================================
-- 5. CUSTOM_FIELDS_DEFINITIONS — user-level custom field schema
-- =============================================================================
CREATE TABLE public.custom_fields_definitions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,        -- snake_case used as key in contacts.custom_fields jsonb
  display_name TEXT NOT NULL,
  field_type TEXT DEFAULT 'text', -- text, number, date, url, select
  options JSONB,                  -- for type=select
  is_required BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, field_key)
);

ALTER TABLE public.custom_fields_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own custom fields"
  ON public.custom_fields_definitions FOR ALL
  USING (auth.uid() = user_id);


-- =============================================================================
-- 6. CONTACTS — shared across workspaces (user-level)
-- =============================================================================
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
  status TEXT DEFAULT 'active',     -- active, unsubscribed, blocked, bounced
  source TEXT,                       -- csv_import, manual, api, apollo

  priority TEXT DEFAULT 'medium',    -- low, medium, high

  -- Aggregate stats across workspaces (denormalized for performance)
  total_emails_sent_all_workspaces INTEGER DEFAULT 0,
  last_contacted_at_any TIMESTAMPTZ,

  unsubscribe_token TEXT UNIQUE DEFAULT gen_random_uuid()::text,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ,

  UNIQUE(user_id, email)
);

CREATE INDEX idx_contacts_user
  ON public.contacts(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_status
  ON public.contacts(user_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_tags
  ON public.contacts USING GIN(tags);
CREATE INDEX idx_contacts_email
  ON public.contacts(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_unsubscribe_token
  ON public.contacts(unsubscribe_token);
CREATE INDEX idx_contacts_search
  ON public.contacts USING GIN(
    to_tsvector('simple',
      coalesce(first_name, '') || ' ' ||
      coalesce(last_name, '') || ' ' ||
      coalesce(email, '') || ' ' ||
      coalesce(company, '')
    )
  );

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own contacts"
  ON public.contacts FOR ALL
  USING (auth.uid() = user_id);

CREATE TRIGGER set_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 7. CONTACT_WORKSPACE_DATA — per-workspace state for each contact
-- =============================================================================
CREATE TABLE public.contact_workspace_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Per-workspace pipeline stage
  lead_stage_id TEXT,    -- references workspaces.pipeline_stages[].id (no FK, soft ref)
  lead_stage_updated_at TIMESTAMPTZ,

  -- Per-workspace notes
  workspace_notes TEXT,

  -- Per-workspace stats
  total_emails_sent INTEGER DEFAULT 0,
  total_emails_opened INTEGER DEFAULT 0,
  total_replies INTEGER DEFAULT 0,
  last_contacted_at TIMESTAMPTZ,
  last_replied_at TIMESTAMPTZ,

  -- Per-workspace exclusion
  is_excluded BOOLEAN DEFAULT false,
  excluded_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(contact_id, workspace_id)
);

CREATE INDEX idx_contact_workspace_contact
  ON public.contact_workspace_data(contact_id);
CREATE INDEX idx_contact_workspace_workspace
  ON public.contact_workspace_data(workspace_id);
CREATE INDEX idx_contact_workspace_stage
  ON public.contact_workspace_data(workspace_id, lead_stage_id);

ALTER TABLE public.contact_workspace_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own contact workspace data"
  ON public.contact_workspace_data FOR ALL
  USING (auth.uid() = user_id);

CREATE TRIGGER set_contact_workspace_data_updated_at
  BEFORE UPDATE ON public.contact_workspace_data
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 8. TEMPLATES — workspace-specific
-- =============================================================================
CREATE TABLE public.templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  category TEXT,
  subject_lines TEXT[] NOT NULL DEFAULT '{}',  -- multiple for A/B variation
  body_html TEXT NOT NULL,
  body_plain TEXT NOT NULL,
  variables_used TEXT[] DEFAULT '{}',           -- auto-detected
  is_starter BOOLEAN DEFAULT false,
  times_used INTEGER DEFAULT 0,
  avg_open_rate FLOAT,
  avg_reply_rate FLOAT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_templates_workspace
  ON public.templates(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_templates_category
  ON public.templates(workspace_id, category) WHERE deleted_at IS NULL;

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own templates"
  ON public.templates FOR ALL
  USING (auth.uid() = user_id);

CREATE TRIGGER set_templates_updated_at
  BEFORE UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 9. TEMPLATE_ATTACHMENTS — PDF attachment metadata
--     (Files stored in Supabase Storage, see 0002_storage.sql)
-- =============================================================================
CREATE TABLE public.template_attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID REFERENCES public.templates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,    -- path in Supabase Storage bucket
  size_bytes INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_template_attachments_template
  ON public.template_attachments(template_id);
CREATE INDEX idx_template_attachments_workspace
  ON public.template_attachments(workspace_id);

ALTER TABLE public.template_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own attachments"
  ON public.template_attachments FOR ALL
  USING (auth.uid() = user_id);


-- =============================================================================
-- 10. CAMPAIGNS — one-shot campaigns (different from send_queues)
-- =============================================================================
CREATE TABLE public.campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email_account_id UUID NOT NULL REFERENCES public.email_accounts(id),
  template_id UUID REFERENCES public.templates(id) ON DELETE SET NULL,

  name TEXT NOT NULL,

  -- Template snapshot (in case template deleted)
  template_subject_lines TEXT[] NOT NULL,
  template_body_html TEXT NOT NULL,
  template_body_plain TEXT NOT NULL,

  -- Send settings
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

  -- AI personalization
  use_ai_opener BOOLEAN DEFAULT true,

  -- Stats (denormalized)
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  opened_count INTEGER DEFAULT 0,
  replied_count INTEGER DEFAULT 0,
  bounced_count INTEGER DEFAULT 0,
  unsubscribed_count INTEGER DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'draft',  -- draft, scheduled, running, paused, completed, failed
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_campaigns_user
  ON public.campaigns(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_campaigns_workspace
  ON public.campaigns(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_campaigns_status
  ON public.campaigns(status) WHERE deleted_at IS NULL;

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own campaigns"
  ON public.campaigns FOR ALL
  USING (auth.uid() = user_id);

CREATE TRIGGER set_campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 11. CAMPAIGN_RECIPIENTS — per-contact status in a campaign
-- =============================================================================
CREATE TABLE public.campaign_recipients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  contact_email TEXT NOT NULL,    -- snapshot in case contact deleted

  status TEXT DEFAULT 'pending',  -- pending, sending, sent, delivered, opened, replied, bounced, unsubscribed, failed
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
  gmail_subject_used TEXT,

  -- Variables snapshot (lighter than full body)
  variables_used JSONB DEFAULT '{}'::jsonb,
  ai_opener TEXT,                 -- generated opener line

  -- Tracking
  open_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,

  -- Errors
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(campaign_id, contact_id)
);

CREATE INDEX idx_recipients_campaign ON public.campaign_recipients(campaign_id);
CREATE INDEX idx_recipients_contact ON public.campaign_recipients(contact_id);
CREATE INDEX idx_recipients_user ON public.campaign_recipients(user_id);
CREATE INDEX idx_recipients_workspace ON public.campaign_recipients(workspace_id);
CREATE INDEX idx_recipients_status ON public.campaign_recipients(status, campaign_id);
CREATE INDEX idx_recipients_thread ON public.campaign_recipients(gmail_thread_id) WHERE gmail_thread_id IS NOT NULL;
CREATE INDEX idx_recipients_pending ON public.campaign_recipients(status, scheduled_at) WHERE status = 'pending';

ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own recipients"
  ON public.campaign_recipients FOR ALL
  USING (auth.uid() = user_id);

CREATE TRIGGER set_campaign_recipients_updated_at
  BEFORE UPDATE ON public.campaign_recipients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 12. FOLLOWUP_HISTORY — auto follow-up tracking
-- =============================================================================
CREATE TABLE public.followup_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_recipient_id UUID NOT NULL REFERENCES public.campaign_recipients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  followup_step INTEGER NOT NULL,  -- 1, 2, 3
  template_id UUID REFERENCES public.templates(id),
  gmail_message_id TEXT,
  sent_at TIMESTAMPTZ DEFAULT now(),
  opened_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ
);

CREATE INDEX idx_followup_recipient
  ON public.followup_history(campaign_recipient_id);

ALTER TABLE public.followup_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own followups"
  ON public.followup_history FOR ALL
  USING (auth.uid() = user_id);


-- =============================================================================
-- 13. SEND_QUEUES — automated daily sending (the "kerja sendiri" queues)
--     This is the core of Fase 6 automation.
-- =============================================================================
CREATE TABLE public.send_queues (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  template_id UUID REFERENCES public.templates(id) ON DELETE SET NULL,
  audience_filter JSONB NOT NULL,   -- saved filter snapshot

  -- Schedule (per queue, can override workspace defaults)
  is_active BOOLEAN DEFAULT true,
  schedule_days INTEGER[] DEFAULT '{1,2,3,4,5}',
  schedule_start_time TIME DEFAULT '09:00',
  schedule_end_time TIME DEFAULT '11:00',
  daily_target INTEGER DEFAULT 30,

  -- Auto follow-up
  followup_enabled BOOLEAN DEFAULT false,
  followup_template_id UUID REFERENCES public.templates(id),
  followup_after_days INTEGER DEFAULT 4,

  -- AI personalization
  use_ai_opener BOOLEAN DEFAULT true,

  -- Stats (denormalized)
  total_in_queue INTEGER DEFAULT 0,
  total_sent INTEGER DEFAULT 0,
  total_pending INTEGER DEFAULT 0,
  total_replied INTEGER DEFAULT 0,
  total_bounced INTEGER DEFAULT 0,

  -- Run timestamps
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  paused_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_send_queues_user ON public.send_queues(user_id);
CREATE INDEX idx_send_queues_workspace ON public.send_queues(workspace_id);
CREATE INDEX idx_send_queues_active ON public.send_queues(is_active) WHERE is_active = true;

ALTER TABLE public.send_queues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own queues"
  ON public.send_queues FOR ALL
  USING (auth.uid() = user_id);

CREATE TRIGGER set_send_queues_updated_at
  BEFORE UPDATE ON public.send_queues
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 14. QUEUE_RECIPIENTS — contacts queued for automated sending
-- =============================================================================
CREATE TABLE public.queue_recipients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  queue_id UUID NOT NULL REFERENCES public.send_queues(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  status TEXT DEFAULT 'pending',  -- pending, sent, replied, bounced, skipped
  scheduled_for_date DATE,
  priority INTEGER DEFAULT 0,

  sent_at TIMESTAMPTZ,
  campaign_recipient_id UUID REFERENCES public.campaign_recipients(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(queue_id, contact_id)
);

CREATE INDEX idx_queue_recipients_queue
  ON public.queue_recipients(queue_id, status);
CREATE INDEX idx_queue_recipients_pending
  ON public.queue_recipients(status, scheduled_for_date) WHERE status = 'pending';
CREATE INDEX idx_queue_recipients_user
  ON public.queue_recipients(user_id);

ALTER TABLE public.queue_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own queue recipients"
  ON public.queue_recipients FOR ALL
  USING (auth.uid() = user_id);


-- =============================================================================
-- 15. SEND_JOBS — background job queue (no RLS, service role only)
-- =============================================================================
CREATE TABLE public.send_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  queue_id UUID REFERENCES public.send_queues(id) ON DELETE CASCADE,

  status TEXT DEFAULT 'pending',  -- pending, running, completed, failed
  job_type TEXT DEFAULT 'campaign_send',  -- campaign_send, queue_run, followup_send

  priority INTEGER DEFAULT 0,
  picked_up_at TIMESTAMPTZ,
  picked_up_by TEXT,
  completed_at TIMESTAMPTZ,
  error TEXT,
  retry_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_jobs_pending
  ON public.send_jobs(status, priority DESC, created_at)
  WHERE status = 'pending';

-- No RLS — only service role accesses this table


-- =============================================================================
-- 16. ACTIVITY_LOG — recent activity feed for dashboard
-- =============================================================================
CREATE TABLE public.activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,

  activity_type TEXT NOT NULL,    -- email_sent, email_opened, email_replied, queue_started, etc
  entity_type TEXT,                -- campaign, contact, template, queue
  entity_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_activity_user_time
  ON public.activity_log(user_id, created_at DESC);
CREATE INDEX idx_activity_workspace_time
  ON public.activity_log(workspace_id, created_at DESC) WHERE workspace_id IS NOT NULL;

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own activity"
  ON public.activity_log FOR SELECT
  USING (auth.uid() = user_id);


-- =============================================================================
-- 17. SAVED_FILTERS — saved contact filter views per workspace
-- =============================================================================
CREATE TABLE public.saved_filters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  filter_definition JSONB NOT NULL,
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_saved_filters_user ON public.saved_filters(user_id);
CREATE INDEX idx_saved_filters_workspace ON public.saved_filters(workspace_id) WHERE workspace_id IS NOT NULL;

ALTER TABLE public.saved_filters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own filters"
  ON public.saved_filters FOR ALL
  USING (auth.uid() = user_id);


-- =============================================================================
-- TRIGGER: Auto-create contact_workspace_data on first campaign interaction
-- =============================================================================
CREATE OR REPLACE FUNCTION public.ensure_contact_workspace_data()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.contact_workspace_data (contact_id, workspace_id, user_id)
  VALUES (NEW.contact_id, NEW.workspace_id, NEW.user_id)
  ON CONFLICT (contact_id, workspace_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_campaign_recipient_created
  AFTER INSERT ON public.campaign_recipients
  FOR EACH ROW EXECUTE FUNCTION public.ensure_contact_workspace_data();


-- =============================================================================
-- TRIGGER: Auto-update campaign stats on recipient status change
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_campaign_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'sent' THEN
      UPDATE public.campaigns
        SET sent_count = sent_count + 1
        WHERE id = NEW.campaign_id;
    ELSIF NEW.status = 'opened' AND OLD.status NOT IN ('replied') THEN
      UPDATE public.campaigns
        SET opened_count = opened_count + 1
        WHERE id = NEW.campaign_id;
    ELSIF NEW.status = 'replied' THEN
      UPDATE public.campaigns
        SET replied_count = replied_count + 1
        WHERE id = NEW.campaign_id;
    ELSIF NEW.status = 'bounced' THEN
      UPDATE public.campaigns
        SET bounced_count = bounced_count + 1
        WHERE id = NEW.campaign_id;
    ELSIF NEW.status = 'unsubscribed' THEN
      UPDATE public.campaigns
        SET unsubscribed_count = unsubscribed_count + 1
        WHERE id = NEW.campaign_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_recipient_status_change
  AFTER UPDATE OF status ON public.campaign_recipients
  FOR EACH ROW EXECUTE FUNCTION public.update_campaign_stats();


-- =============================================================================
-- FUNCTION: Reset daily quotas (run via pg_cron daily at 00:00 WIB)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.reset_daily_quotas()
RETURNS void AS $$
BEGIN
  UPDATE public.email_accounts
  SET emails_sent_today = 0,
      quota_reset_at = now()
  WHERE quota_reset_at < now() - interval '24 hours';
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- DONE
-- After running this:
--   1. Run 0002_storage.sql for the attachments storage bucket
--   2. Enable pg_cron extension via Supabase dashboard (Database → Extensions)
--   3. Schedule cron jobs in Fase 6 (queue runner) — separate migration later
-- =============================================================================
