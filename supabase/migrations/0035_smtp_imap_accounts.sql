-- =============================================================================
-- ColdReach — SMTP/IMAP sender accounts (custom-domain mailboxes, e.g. Hostinger)
-- File: 0035_smtp_imap_accounts.sql
--
-- email_accounts was Gmail-OAuth only. provider='smtp' rows send via SMTP and
-- detect replies/bounces via IMAP. Connection details live in smtp_config:
--   { smtp_host, smtp_port, imap_host, imap_port, password_encrypted }
-- (username = email). The OAuth token columns stay NOT NULL; SMTP rows store
-- '' there and a far-future token_expires_at so no token refresh ever runs.
-- =============================================================================

ALTER TABLE public.email_accounts
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'gmail'
    CHECK (provider IN ('gmail', 'smtp')),
  ADD COLUMN IF NOT EXISTS smtp_config JSONB;
