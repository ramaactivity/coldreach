/**
 * Workspace email signature — structured data + email-safe renderers.
 *
 * Stored in workspaces.signature_data (jsonb). One source of truth for
 * both the HTML version (appended to multipart/alternative HTML part)
 * and the plain text version (appended to plain part with the RFC 3676
 * "-- " separator so Gmail can collapse it).
 *
 * Email HTML rules of the road, baked into the renderer below:
 *   - Table-based layout (no flexbox/grid)
 *   - Inline CSS only (no <style> blocks — Gmail strips them in some surfaces)
 *   - No SVG, no data: URLs in <img> (Gmail strips)
 *   - Logos use external HTTPS PNG/JPG (workspace-logos public bucket)
 *   - Social "icons" are CSS-only colored badges with brand initials, so we
 *     don't depend on any external icon CDN that might break
 */

export type SocialPlatform =
  | "instagram"
  | "facebook"
  | "linkedin"
  | "twitter"
  | "youtube"
  | "tiktok"
  | "threads"
  | "pinterest"
  | "custom";

export type SignatureSocial = {
  platform: SocialPlatform;
  url: string;
  /** Optional display label, e.g. "@handle" or "/in/company". Not rendered
   *  in the badge (we use brand initial) but shown in the editor + plain text. */
  label?: string;
};

export type SignatureData = {
  name?: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  /** Raw digits incl. country code, e.g. "628123456789". We auto-link to wa.me. */
  whatsapp?: string;
  website?: string;
  /** HTTPS URL to a hosted PNG/JPG/WebP. Should be small (~96x96, <100 KB). */
  logo_url?: string;
  /** Hex with leading #. Falls back to workspace color_theme if absent. */
  brand_color?: string;
  socials?: SignatureSocial[];
};

const SOCIAL_META: Record<
  SocialPlatform,
  { abbr: string; color: string; label: string }
> = {
  instagram: { abbr: "IG", color: "#E4405F", label: "Instagram" },
  facebook: { abbr: "f", color: "#1877F2", label: "Facebook" },
  linkedin: { abbr: "in", color: "#0A66C2", label: "LinkedIn" },
  twitter: { abbr: "X", color: "#000000", label: "X / Twitter" },
  youtube: { abbr: "▶", color: "#FF0000", label: "YouTube" },
  tiktok: { abbr: "TT", color: "#000000", label: "TikTok" },
  threads: { abbr: "@", color: "#000000", label: "Threads" },
  pinterest: { abbr: "P", color: "#BD081C", label: "Pinterest" },
  custom: { abbr: "•", color: "#6b7280", label: "Link" },
};

export const SOCIAL_OPTIONS: Array<{
  value: SocialPlatform;
  label: string;
  color: string;
}> = (Object.keys(SOCIAL_META) as SocialPlatform[]).map((p) => ({
  value: p,
  label: SOCIAL_META[p].label,
  color: SOCIAL_META[p].color,
}));

export function socialMeta(platform: SocialPlatform) {
  return SOCIAL_META[platform] ?? SOCIAL_META.custom;
}

/** True when signature_data is effectively empty (no content to render). */
export function isSignatureEmpty(data: SignatureData | null | undefined): boolean {
  if (!data) return true;
  const hasField =
    !!(data.name || data.title || data.company || data.email || data.phone ||
       data.whatsapp || data.website || data.logo_url);
  const hasSocial = (data.socials ?? []).some((s) => s.url?.trim());
  return !hasField && !hasSocial;
}

// HTML escape — defense against signature data with user-controlled strings.
function esc(s: string | undefined | null): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function digitsOnly(s: string): string {
  return s.replace(/[^0-9]/g, "");
}

function waUrl(whatsapp: string): string {
  return `https://wa.me/${digitsOnly(whatsapp)}`;
}

/** Strip protocol/path for display. "https://www.tiska.com/path" → "tiska.com" */
function websiteDisplay(url: string): string {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
}

function normalizeWebsiteHref(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

/**
 * Render the structured signature into an email-safe HTML fragment.
 * Output is meant to be placed inside <body>, not a full document. Renderer
 * appends it AFTER the body and BEFORE the unsubscribe footer.
 */
export function renderSignatureHtml(
  data: SignatureData | null | undefined,
  opts: { fallbackBrandColor?: string } = {},
): string {
  if (isSignatureEmpty(data)) return "";
  const d = data as SignatureData;
  const brand = d.brand_color || opts.fallbackBrandColor || "#0f172a";

  const nameLine = d.name
    ? `<div style="font-weight:600;font-size:14px;color:#111827;line-height:1.3;">${esc(d.name)}</div>`
    : "";

  const titleParts: string[] = [];
  if (d.title) titleParts.push(esc(d.title));
  if (d.company) titleParts.push(esc(d.company));
  const titleLine = titleParts.length
    ? `<div style="color:#6b7280;font-size:12px;line-height:1.35;margin-top:2px;">${titleParts.join(' <span style="color:#cbd5e1;">·</span> ')}</div>`
    : "";

  // Contact rows — one <div> per row for max email-client compat.
  const contactRows: string[] = [];
  const linkStyle = `color:#374151;text-decoration:none;`;
  if (d.email) {
    contactRows.push(
      `<div style="margin-top:4px;font-size:12px;line-height:1.5;"><span style="display:inline-block;width:14px;color:${brand};">✉</span> <a href="mailto:${esc(d.email)}" style="${linkStyle}">${esc(d.email)}</a></div>`,
    );
  }
  if (d.phone) {
    const telHref = `tel:${digitsOnly(d.phone)}`;
    contactRows.push(
      `<div style="margin-top:2px;font-size:12px;line-height:1.5;"><span style="display:inline-block;width:14px;color:${brand};">☎</span> <a href="${esc(telHref)}" style="${linkStyle}">${esc(d.phone)}</a></div>`,
    );
  }
  if (d.whatsapp) {
    contactRows.push(
      `<div style="margin-top:2px;font-size:12px;line-height:1.5;"><span style="display:inline-block;width:14px;color:#25D366;">●</span> <a href="${esc(waUrl(d.whatsapp))}" style="${linkStyle}">WhatsApp ${esc(d.whatsapp)}</a></div>`,
    );
  }
  if (d.website) {
    const href = normalizeWebsiteHref(d.website);
    contactRows.push(
      `<div style="margin-top:2px;font-size:12px;line-height:1.5;"><span style="display:inline-block;width:14px;color:${brand};">◉</span> <a href="${esc(href)}" style="${linkStyle}">${esc(websiteDisplay(d.website))}</a></div>`,
    );
  }

  // Social badges
  const socialBadges = (d.socials ?? [])
    .filter((s) => s.url && s.url.trim())
    .map((s) => {
      const meta = socialMeta(s.platform);
      const safeHref = esc(normalizeWebsiteHref(s.url));
      return `<a href="${safeHref}" style="display:inline-block;width:26px;height:26px;line-height:26px;text-align:center;border-radius:6px;font-size:11px;font-weight:700;color:#ffffff;background-color:${meta.color};text-decoration:none;margin-right:6px;margin-top:4px;">${esc(meta.abbr)}</a>`;
    })
    .join("");
  const socialsBlock = socialBadges
    ? `<div style="margin-top:10px;font-size:0;line-height:0;">${socialBadges}</div>`
    : "";

  const logoCell = d.logo_url
    ? `<td valign="top" style="padding:0 14px 0 0;width:64px;"><img src="${esc(d.logo_url)}" alt="${esc(d.company || d.name || "Logo")}" width="56" height="56" style="display:block;border:0;border-radius:8px;object-fit:cover;"></td>`
    : "";

  return [
    // Two newlines so Apple Mail/Outlook keep the gap above signature.
    `<div style="margin-top:24px;padding-top:14px;border-top:2px solid ${brand};max-width:520px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">`,
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;">`,
    `<tr>`,
    logoCell,
    `<td valign="top">`,
    nameLine,
    titleLine,
    contactRows.join(""),
    socialsBlock,
    `</td>`,
    `</tr>`,
    `</table>`,
    `</div>`,
  ].join("");
}

/**
 * Plain text version of the signature. Derived from the same structured data
 * so HTML + plain stay in sync. The "-- " (RFC 3676) separator is *not*
 * included here — email-sender.ts adds it once before appending.
 */
export function renderSignaturePlain(
  data: SignatureData | null | undefined,
): string {
  if (isSignatureEmpty(data)) return "";
  const d = data as SignatureData;
  const lines: string[] = [];
  if (d.name) lines.push(d.name);
  const titleParts: string[] = [];
  if (d.title) titleParts.push(d.title);
  if (d.company) titleParts.push(d.company);
  if (titleParts.length) lines.push(titleParts.join(" — "));
  if (d.email) lines.push(d.email);
  if (d.phone) lines.push(d.phone);
  if (d.whatsapp) lines.push(`WhatsApp: ${waUrl(d.whatsapp)}`);
  if (d.website) lines.push(normalizeWebsiteHref(d.website));
  for (const s of d.socials ?? []) {
    if (!s.url?.trim()) continue;
    const meta = socialMeta(s.platform);
    const label = s.label?.trim();
    lines.push(label ? `${meta.label} (${label}): ${s.url}` : `${meta.label}: ${s.url}`);
  }
  return lines.join("\n");
}
