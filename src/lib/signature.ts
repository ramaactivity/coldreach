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
 *   - All images are external HTTPS PNG
 *   - Logos use the workspace-logos public bucket
 *   - Real brand icons come from cdn.simpleicons.org via the images.weserv.nl
 *     proxy which serves them as PNG (Gmail-friendly). Both services have
 *     years-long uptime track records; if either ever flakes we can swap
 *     in pre-baked PNGs under /public/email-icons/ without touching the
 *     data model.
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
   *  in the icon (we use the brand mark) but shown in plain text + editor. */
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
  /** HTTPS URL to a hosted PNG/JPG/WebP. Recommend square aspect, >=192px. */
  logo_url?: string;
  /** Hex with leading #. Falls back to workspace color_theme if absent. */
  brand_color?: string;
  socials?: SignatureSocial[];
};

type SocialMeta = {
  /** Simple Icons slug (https://simpleicons.org/?q=…). */
  slug: string;
  /** Brand color, no leading #. */
  color: string;
  /** Display label in plain text + editor. */
  label: string;
};

const SOCIAL_META: Record<SocialPlatform, SocialMeta> = {
  instagram: { slug: "instagram", color: "E4405F", label: "Instagram" },
  facebook:  { slug: "facebook",  color: "1877F2", label: "Facebook" },
  linkedin:  { slug: "linkedin",  color: "0A66C2", label: "LinkedIn" },
  twitter:   { slug: "x",         color: "000000", label: "X / Twitter" },
  youtube:   { slug: "youtube",   color: "FF0000", label: "YouTube" },
  tiktok:    { slug: "tiktok",    color: "000000", label: "TikTok" },
  threads:   { slug: "threads",   color: "000000", label: "Threads" },
  pinterest: { slug: "pinterest", color: "BD081C", label: "Pinterest" },
  // 'custom' falls back to a generic globe icon
  custom:    { slug: "googlechrome", color: "6B7280", label: "Link" },
};

export const SOCIAL_OPTIONS: Array<{
  value: SocialPlatform;
  label: string;
  color: string;
}> = (Object.keys(SOCIAL_META) as SocialPlatform[]).map((p) => ({
  value: p,
  label: SOCIAL_META[p].label,
  color: `#${SOCIAL_META[p].color}`,
}));

export function socialMeta(platform: SocialPlatform): SocialMeta {
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

/** Build a weserv proxy URL for a Simple Icons brand glyph. The `colorHex`
 *  is passed straight to Simple Icons (no leading #) — use `ffffff` for a
 *  white-on-color badge or any brand hex for a colored standalone glyph. */
function brandIconPng(slug: string, colorHex: string, size = 56): string {
  const inner = `cdn.simpleicons.org/${slug}/${colorHex}`;
  return `https://images.weserv.nl/?url=${encodeURIComponent(inner)}&w=${size}&h=${size}&fit=contain&output=png`;
}

const FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * Render the structured signature into an email-safe HTML fragment.
 * Output is meant to be placed inside <body>; the renderer wraps the
 * whole thing in a single outer div so callers don't need extra spacing.
 */
export function renderSignatureHtml(
  data: SignatureData | null | undefined,
  opts: { fallbackBrandColor?: string } = {},
): string {
  if (isSignatureEmpty(data)) return "";
  const d = data as SignatureData;
  const brand = (d.brand_color || opts.fallbackBrandColor || "#0f172a").replace("#", "");

  // --- Name + title block ----------------------------------------------------
  const nameLine = d.name
    ? `<div style="font-family:${FONT_STACK};font-weight:600;font-size:17px;line-height:1.25;color:#0f172a;letter-spacing:-0.01em;">${esc(d.name)}</div>`
    : "";

  const titleParts: string[] = [];
  if (d.title) titleParts.push(esc(d.title));
  if (d.company) titleParts.push(`<span style="color:#0f172a;">${esc(d.company)}</span>`);
  const titleLine = titleParts.length
    ? `<div style="font-family:${FONT_STACK};color:#6b7280;font-size:13px;line-height:1.4;margin-top:3px;">${titleParts.join(' <span style="color:#cbd5e1;margin:0 4px;">·</span> ')}</div>`
    : "";

  // --- Contact rows ----------------------------------------------------------
  // Each row: small monochrome glyph (unicode) + linked text. Keeping it
  // text-glyph rather than images for the small-screen contact rows keeps
  // file size + load time down where it matters least.
  const contactRow = (icon: string, text: string, href: string) =>
    `<tr><td style="padding:3px 0;font-family:${FONT_STACK};font-size:13px;line-height:1.5;color:#374151;" valign="middle">` +
      `<span style="display:inline-block;width:18px;color:#${brand};font-weight:600;">${icon}</span>` +
      `<a href="${esc(href)}" style="color:#374151;text-decoration:none;">${text}</a>` +
    `</td></tr>`;

  const contactRows: string[] = [];
  if (d.email) {
    contactRows.push(contactRow("✉", esc(d.email), `mailto:${d.email}`));
  }
  if (d.phone) {
    contactRows.push(contactRow("☎", esc(d.phone), `tel:${digitsOnly(d.phone)}`));
  }
  if (d.whatsapp) {
    // WhatsApp gets its real green glyph (other rows use unicode for
    // consistent vertical alignment — there's no widely-supported unicode
    // for the WA mark and brand recognition matters here).
    contactRows.push(
      `<tr><td style="padding:3px 0;font-family:${FONT_STACK};font-size:13px;line-height:1.5;color:#374151;" valign="middle">` +
        `<img src="${brandIconPng("whatsapp", "25D366", 36)}" alt="" width="14" height="14" style="display:inline-block;vertical-align:-3px;margin-right:6px;border:0;">` +
        `<a href="${esc(waUrl(d.whatsapp))}" style="color:#374151;text-decoration:none;">${esc(d.whatsapp)}</a>` +
      `</td></tr>`,
    );
  }
  if (d.website) {
    contactRows.push(
      contactRow("◉", esc(websiteDisplay(d.website)), normalizeWebsiteHref(d.website)),
    );
  }
  const contactsTable = contactRows.length
    ? `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;margin-top:8px;">${contactRows.join("")}</table>`
    : "";

  // --- Social icons row ------------------------------------------------------
  // Real brand PNG via weserv → simpleicons proxy. Each icon sits in a
  // brand-colored 32×32 rounded square so they remain visible against any
  // background.
  const socialIcons = (d.socials ?? [])
    .filter((s) => s.url && s.url.trim())
    .map((s) => {
      const meta = socialMeta(s.platform);
      const href = esc(normalizeWebsiteHref(s.url));
      const iconPng = brandIconPng(meta.slug, "ffffff", 56);
      return (
        `<a href="${href}" style="display:inline-block;margin-right:6px;text-decoration:none;" aria-label="${esc(meta.label)}">` +
          `<img src="${iconPng}" alt="${esc(meta.label)}" width="28" height="28" ` +
          `style="display:block;border:0;border-radius:8px;background-color:#${meta.color};padding:6px;box-sizing:border-box;width:28px;height:28px;">` +
        `</a>`
      );
    })
    .join("");
  const socialsBlock = socialIcons
    ? `<div style="margin-top:14px;line-height:0;font-size:0;">${socialIcons}</div>`
    : "";

  // --- Logo cell -------------------------------------------------------------
  // 96×96 displayed, rounded, with a soft shadow ring. We don't show a
  // placeholder when no logo is set — keep the layout clean.
  const logoCell = d.logo_url
    ? `<td valign="top" style="padding:0 22px 0 0;width:96px;">
         <img src="${esc(d.logo_url)}" alt="${esc(d.company || d.name || "Logo")}" width="96" height="96" style="display:block;border:0;border-radius:14px;object-fit:cover;width:96px;height:96px;background:#ffffff;">
       </td>`
    : "";

  const dividerCell = d.logo_url
    ? `<td valign="middle" style="padding:0 22px 0 0;width:1px;">
         <div style="width:2px;height:84px;background:#${brand};border-radius:2px;opacity:0.85;"></div>
       </td>`
    : "";

  // --- Outer wrapper ---------------------------------------------------------
  return [
    `<div style="margin-top:28px;padding-top:18px;border-top:1px solid #e5e7eb;font-family:${FONT_STACK};color:#0f172a;max-width:560px;">`,
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;">`,
    `<tr>`,
    logoCell,
    dividerCell,
    `<td valign="top">`,
    nameLine,
    titleLine,
    contactsTable,
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
