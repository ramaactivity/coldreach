// Client-safe types and helpers for templates. No server imports.

export type Template = {
  id: string;
  user_id: string;
  workspace_id: string;
  name: string;
  category: string | null;
  subject_lines: string[];
  body_html: string;
  body_plain: string;
  variables_used: string[];
  is_starter: boolean;
  times_used: number;
  avg_open_rate: number | null;
  avg_reply_rate: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type TemplateAttachment = {
  id: string;
  template_id: string | null;
  user_id: string;
  workspace_id: string;
  filename: string;
  storage_path: string;
  size_bytes: number;
  mime_type: string;
  display_order: number;
  created_at: string;
};

export type TemplateWithAttachments = Template & {
  attachments: TemplateAttachment[];
};

export const SUPPORTED_VARIABLES = [
  "first_name",
  "last_name",
  "full_name",
  "email",
  "company",
  "position",
  "ai_opener",
] as const;

export type SupportedVariable = (typeof SUPPORTED_VARIABLES)[number];

const VARIABLE_REGEX = /\{(\w+)\}/g;

export function extractVariables(body: string): string[] {
  const found = new Set<string>();
  for (const match of body.matchAll(VARIABLE_REGEX)) {
    found.add(match[1]);
  }
  return Array.from(found);
}

export function plainToHtml(plain: string): string {
  const escaped = plain
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped
    .split(/\n\n+/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`);
  return paragraphs.join("\n");
}

export function renderPreview(
  body: string,
  values: Record<string, string>,
): string {
  return body.replace(VARIABLE_REGEX, (_, key) => values[key] ?? `{${key}}`);
}
