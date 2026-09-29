// Client-safe types and helpers for templates. No server imports.

export type Template = {
  id: string;
  user_id: string;
  workspace_id: string;
  name: string;
  category: string | null;
  subject_lines: string[];
  subject_lines_en: string[] | null;
  body_html: string;
  body_plain: string;
  body_plain_en: string | null;
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

// URLs in plain-text bodies. Captures up to whitespace / quote / angle
// bracket; trailing punctuation is stripped after the match so "see
// google.com." doesn't include the period in the link.
const URL_REGEX = /(https?:\/\/[^\s<>"]+)/g;

export function plainToHtml(
  plain: string,
  linkWrapper?: (url: string) => string,
): string {
  const escaped = plain
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped.split(/\n\n+/).map((p) => {
    const withBr = p.replace(/\n/g, "<br>");
    const linked = withBr.replace(URL_REGEX, (raw) => {
      // peel trailing punctuation (.,;:!?)] which is rarely part of a URL
      const trailingMatch = raw.match(/[.,;:!?)\]]+$/);
      const trailing = trailingMatch ? trailingMatch[0] : "";
      const url = trailing ? raw.slice(0, -trailing.length) : raw;
      // `plain` was HTML-escaped above, so a URL query string like `?a=1&b=2`
      // is now `?a=1&amp;b=2`. The href / click-tracking target must use the
      // TRUE url (decoded) or the redirect lands on a literal `&amp;b` param
      // and the HMAC signature is computed over the wrong string. The visible
      // anchor text keeps the escaped form (renders as `&` in the browser).
      const trueUrl = url
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
      const href = linkWrapper ? linkWrapper(trueUrl) : trueUrl;
      const safeHref = href.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${url}</a>${trailing}`;
    });
    return `<p>${linked}</p>`;
  });
  return paragraphs.join("\n");
}

export function renderPreview(
  body: string,
  values: Record<string, string>,
): string {
  return body.replace(VARIABLE_REGEX, (_, key) => values[key] ?? `{${key}}`);
}

// Short all-caps words that are real acronyms (BCA, BNI, XL, PLN…) — keep
// them upper-case when title-casing a SHOUTED name.
const ACRONYM_MAX_LEN = 3;

function titleCaseIfShouting(s: string): string {
  // Only rewrite text typed in caps lock — at least two ALL-CAPS words of 4+
  // letters. "GoTo Group", "tiket.com" and "HSBC Indonesia" stay as they are.
  const shouted = s.match(/\b[A-Z][A-Z0-9&'-]{3,}\b/g) ?? [];
  if (shouted.length < 2) return s;
  return s.replace(/\b[A-Z][A-Z0-9&.'-]*\b/g, (w) =>
    w.length <= ACRONYM_MAX_LEN ? w : w[0] + w.slice(1).toLowerCase(),
  );
}

/**
 * Company name as a person would write it in a sentence: legal-entity tags
 * dropped ("PT.", ", Tbk", "(Persero)", "CV") and caps-lock names title-cased.
 * "INTI CAKRAWALA CITRA, PT" → "Inti Cakrawala Citra";
 * "PT. Bank Victoria International, Tbk" → "Bank Victoria International".
 */
export function displayCompany(raw: string | null | undefined): string {
  if (!raw) return "";
  const cleaned = raw
    .replace(/\(persero\)/gi, " ")
    .replace(/^\s*(pt|cv)\.?\s+/i, "")
    .replace(/[\s,]+(pt|tbk|cv)\.?\s*$/i, "")
    .replace(/[\s,]+tbk\.?\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s,.]+$/, "")
    .trim();
  return titleCaseIfShouting(cleaned || raw.trim());
}

/** Person name with caps-lock entries title-cased ("MUHAMAD PALINDANG"). */
export function displayPersonName(raw: string | null | undefined): string {
  return raw ? titleCaseIfShouting(raw.trim()) : "";
}
