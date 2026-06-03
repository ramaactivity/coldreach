# 06 — API Specification

API endpoints untuk Next.js. Sebagian besar pakai Server Actions (form submit), sebagian lagi Route Handlers untuk public endpoint (tracking, unsubscribe, OAuth callback).

## Auth Pattern

Semua Server Actions dan API Routes (kecuali public ones) cek auth:
```typescript
import { createClient } from '@/lib/supabase/server';

const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return { error: 'Unauthorized' };
```

## 1. Auth Routes

### `GET /auth/callback`
Google OAuth callback. Exchange code untuk session.

Query params:
- `code` (string)
- `next` (optional, default `/dashboard`)

Response: redirect ke `/dashboard` atau `next`.

### `POST /api/auth/disconnect-gmail`
Disconnect a connected Gmail account (revoke token).

Body:
```json
{ "email_account_id": "uuid" }
```

Response:
```json
{ "success": true }
```

## 2. Contacts (Server Actions)

### `createContact(data)`
Input:
```typescript
{
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  position?: string;
  phone?: string;
  website?: string;
  notes?: string;
  custom_fields?: Record<string, any>;
  tags?: string[];
}
```
Output: `{ contact: Contact } | { error: string }`

### `updateContact(id, data)`
Partial update.

### `deleteContacts(ids: string[])`
Soft delete (set deleted_at).

### `importContactsFromCSV(formData)`
FormData dengan file + mapping config.

Input:
```typescript
{
  file: File; // CSV/XLSX
  column_mapping: Record<string, string>; // CSV column → DB field
  options: {
    skip_duplicates: boolean;
    validate_emails: boolean;
    apply_tags: string[];
  };
}
```

Output:
```typescript
{
  imported: number;
  skipped_duplicates: number;
  skipped_invalid: number;
  errors: { row: number; reason: string }[];
}
```

Implementation note: Parse CSV/XLSX client-side dulu untuk preview, send sebagai JSON ke server. File besar (> 1000 row) batch insert.

### `searchContacts(filter)`
Input:
```typescript
{
  query?: string;
  tags?: string[];
  status?: ContactStatus;
  custom_filters?: any[];
  limit?: number;
  offset?: number;
  order_by?: string;
  order_direction?: 'asc' | 'desc';
}
```

Output: `{ contacts: Contact[]; total: number }`

### `bulkUpdateTags(contact_ids, action, tags)`
```typescript
{
  contact_ids: string[];
  action: 'add' | 'remove' | 'replace';
  tags: string[];
}
```

### `exportContacts(filter)`
Same input as search. Returns CSV string for download.

## 3. Tags (Server Actions)

### `listTags()`
### `createTag({ name, color, description })`
### `updateTag(id, data)`
### `deleteTag(id)` — also remove from all contacts

## 4. Custom Fields (Server Actions)

### `listCustomFields()`
### `createCustomField({ field_key, display_name, field_type, options })`
### `updateCustomField(id, data)`
### `deleteCustomField(id)` — warning if used

## 5. Templates (Server Actions)

### `listTemplates({ category?, include_starter? })`
### `getTemplate(id)`
### `createTemplate(data)`
Input:
```typescript
{
  name: string;
  category?: string;
  subject_lines: string[];
  body_html: string;
  body_plain?: string; // auto-generate if not provided
}
```

### `updateTemplate(id, data)`
### `duplicateTemplate(id)`
### `deleteTemplate(id)` — soft delete
### `previewTemplate(id, contact_id?)`
Render template dengan data dummy atau kontak spesifik. Return rendered HTML.

## 6. Email Accounts (Server Actions)

### `listEmailAccounts()`
### `setDefaultEmailAccount(id)`
### `disconnectEmailAccount(id)`
### `refreshAccountToken(id)` — manual refresh

### `checkAccountHealth(id)`
Cek Gmail API quota tersisa via `GET /gmail/v1/users/me/profile`. Return:
```typescript
{
  email: string;
  quota_used_today: number;
  quota_remaining: number;
  health_status: 'healthy' | 'warning' | 'critical';
  last_error?: string;
}
```

## 7. Campaigns (Server Actions)

### `listCampaigns({ status?, limit?, offset? })`

### `getCampaign(id)`
Return campaign + recipients summary + recent activity.

### `createCampaignDraft(data)`
Input:
```typescript
{
  name: string;
  email_account_id: string;
  template_id: string;
  audience_filter: AudienceFilter;
  settings: {
    daily_quota: number;
    min_delay_seconds: number;
    max_delay_seconds: number;
    send_window_start: string;
    send_window_end: string;
    skip_weekend: boolean;
    scheduled_start_at?: string;
  };
  followup_rules?: FollowupRule[];
}
```
Returns campaign id with status 'draft'.

### `previewCampaign(campaign_id)`
Returns first 5 recipients with rendered email content.

### `startCampaign(campaign_id)`
Validate, populate `campaign_recipients`, create `send_jobs`, update status to 'running' or 'scheduled'.

### `pauseCampaign(campaign_id)`
### `resumeCampaign(campaign_id)`
### `cancelCampaign(campaign_id)` — Mark all pending as cancelled

### `deleteCampaign(id)` — Soft delete

### `getCampaignStats(id)`
Detailed stats:
```typescript
{
  total: number;
  sent: number;
  opened: number;
  replied: number;
  bounced: number;
  unsubscribed: number;
  failed: number;
  open_rate: number;
  reply_rate: number;
  bounce_rate: number;
  timeline: { date: string; sent: number; opened: number; replied: number }[];
}
```

### `listCampaignRecipients(campaign_id, { status?, limit?, offset? })`

## 8. Dashboard (Server Actions)

### `getDashboardStats()`
```typescript
{
  today: {
    sent: number;
    opened: number;
    replied: number;
    quota_remaining: number;
  };
  week: { sent: number; opened: number; replied: number };
  month: { sent: number; opened: number; replied: number };
  rates: { open_rate: number; reply_rate: number; bounce_rate: number };
  health: HealthStatus;
}
```

### `getActivityFeed(limit = 20)`
### `getQuotaStatus()` — quota dari semua connected accounts

## 9. Public Endpoints (Route Handlers)

### `GET /api/track/open/[id].gif`
Open tracking pixel. id = campaign_recipient_id (UUID, gak guessable).

Logic:
1. Update `campaign_recipients` set `opened_at = now()` if NULL, increment `open_count`
2. Insert event log
3. Insert activity log
4. Return 1x1 transparent GIF dengan headers no-cache

### `GET /api/track/click/[id]?url=encoded_url`
Click tracking. Update click_count, log event, redirect.

### `GET /unsubscribe/[token]`
Public page. Halaman dengan tombol konfirmasi.

### `POST /api/unsubscribe/[token]`
Body kosong. Update contact status ke unsubscribed, log event.

### `GET /api/health`
Health check endpoint untuk uptime monitoring (cron-job.org).

## 10. Edge Functions (Supabase)

These run independently in Deno runtime, called via pg_cron.

### `email-sender-worker`
Trigger: `pg_cron` setiap menit.

Logic:
1. Pick `send_jobs` status pending dengan FOR UPDATE SKIP LOCKED
2. Update job status ke 'running'
3. Loop campaign_recipients (status pending):
   - Cek dalam send window?
   - Cek quota tersisa?
   - Render template
   - Send via Gmail API
   - Update recipient status
   - Sleep random 30-90 detik
   - Cek time budget (max 150s per invocation)
4. Mark job complete kalau selesai

### `reply-checker`
Trigger: `pg_cron` tiap 15 menit.

Logic:
1. Get all campaign_recipients status sent/opened dengan gmail_thread_id NOT NULL
2. Group by email_account_id
3. Untuk tiap account:
   - Refresh token kalau perlu
   - Batch get threads via Gmail API
   - Cek setiap thread: ada message dari kontak?
   - Update status sesuai

### `bounce-checker`
Trigger: `pg_cron` tiap 15 menit.

Logic:
1. Untuk tiap email_account, search Gmail dengan query `from:mailer-daemon@googlemail.com newer_than:1d`
2. Parse setiap bounce notification untuk extract failed recipient
3. Match dengan campaign_recipients yang sent dalam 24 jam terakhir
4. Update status: bounced

### `refresh-tokens`
Trigger: `pg_cron` tiap 50 menit.

Logic:
1. Select email_accounts where token_expires_at < now() + interval '15 minutes'
2. Untuk tiap, call Google OAuth refresh endpoint
3. Update token + expires_at
4. Kalau gagal, mark account 'needs_reconnect'

### `followup-scheduler`
Trigger: `pg_cron` setiap jam.

Logic:
1. Untuk semua campaign aktif dengan followup_enabled = true:
2. Untuk tiap recipient yang status sent/opened:
   - Cek waktu sejak terakhir dikirim (sent_at atau followup last)
   - Cek vs followup_rules
   - Kalau memenuhi syarat, create entry di send_jobs untuk followup
3. Worker biasa yang akan eksekusi

### `daily-stats-aggregator`
Trigger: pg_cron tiap hari jam 00:01.

Logic:
1. Reset email_accounts.emails_sent_today
2. Update template avg_open_rate dan avg_reply_rate
3. Cleanup activity_log > 30 hari
4. Cleanup soft-deleted records > 30 hari

## 11. Error Handling Pattern

Server Action standar return shape:
```typescript
type ActionResult<T> =
  | { data: T; error: null }
  | { data: null; error: string };

// Example
async function createContact(input: CreateContactInput): Promise<ActionResult<Contact>> {
  try {
    // ...
    return { data: contact, error: null };
  } catch (e) {
    return { data: null, error: e.message };
  }
}
```

Frontend:
```typescript
const { data, error } = await createContact(input);
if (error) toast.error(error);
else toast.success('Kontak ditambahkan');
```

## 12. Validation

Pakai Zod. Schema di `lib/validations/`.

Example:
```typescript
import { z } from 'zod';

export const createContactSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().max(100).optional(),
  company: z.string().max(200).optional(),
  // ...
});

export type CreateContactInput = z.infer<typeof createContactSchema>;
```

## 13. Rate Limiting

Implement basic rate limit di critical endpoints:
- Import contacts: max 5 per hour per user
- Create campaign: max 20 per hour per user
- Tracking pixel: rate limit per IP via Vercel middleware

Pakai Upstash Redis free tier kalau perlu (10k req/day gratis), atau simple counter table di Postgres.

## 14. Webhooks (Phase 2)

Future: emit webhooks ke endpoint user untuk events seperti email_replied, etc. Simpan di `webhooks` table.
