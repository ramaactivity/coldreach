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
  /** HTTPS URL to a hosted PNG/JPG/WebP. Any aspect ratio — renderer
   *  letterboxes through the weserv proxy so wide / tall / square logos
   *  all render without cropping. */
  logo_url?: string;
  /** Hex with leading #. Falls back to workspace color_theme if absent. */
  brand_color?: string;
  /** Short brand tagline shown in the right column. Italic, accent color. */
  tagline?: string;
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

/** Proxy a workspace logo through weserv to letterbox it into a square box
 *  without cropping or distortion. Any aspect ratio in → square out with
 *  white fill on the empty edges. `fit=contain` preserves aspect ratio. */
function proxyLogoUrl(rawUrl: string, size = 240): string {
  // weserv accepts the URL without protocol; strip + percent-encode.
  const stripped = rawUrl.replace(/^https?:\/\//, "");
  return `https://images.weserv.nl/?url=${encodeURIComponent(stripped)}&w=${size}&h=${size}&fit=contain&cbg=ffffff&output=png`;
}

const FONT_STACK = "Helvetica,Arial,'Helvetica Neue',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

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
  const brand = (d.brand_color || opts.fallbackBrandColor || "#0a0a0a").replace("#", "");

  // ---------------------------------------------------------------------------
  // COLUMN 1 — Logo
  // weserv letterboxes any aspect ratio into a 240×240 PNG with white fill.
  // Image is then displayed at 104×104 inside a 110-wide cell. Square,
  // landscape, and portrait logos all render without cropping or stretching.
  // ---------------------------------------------------------------------------
  const logoCell = d.logo_url
    ? `<td align="left" valign="top" width="110" style="width:110px;padding:0 24px 0 0;vertical-align:top;">` +
        `<img src="${esc(proxyLogoUrl(d.logo_url, 240))}" alt="${esc(d.company || d.name || "Logo")}" width="104" height="104" style="display:block;border:0;width:104px;height:104px;border-radius:12px;background-color:#ffffff;">` +
      `</td>`
    : "";

  // ---------------------------------------------------------------------------
  // COLUMN 2 — Sales Information
  // Name (heavy), title · company (medium muted), contact rows tabular.
  // ---------------------------------------------------------------------------
  const nameLine = d.name
    ? `<div style="font-family:${FONT_STACK};font-weight:700;font-size:18px;line-height:1.2;color:#0a0a0a;letter-spacing:-0.015em;">${esc(d.name)}</div>`
    : "";

  const titleParts: string[] = [];
  if (d.title) titleParts.push(`<span style="color:#0a0a0a;font-weight:500;">${esc(d.title)}</span>`);
  if (d.company) titleParts.push(`<span style="color:#525252;">${esc(d.company)}</span>`);
  const titleLine = titleParts.length
    ? `<div style="font-family:${FONT_STACK};font-size:13px;line-height:1.4;margin-top:4px;">${titleParts.join(' <span style="color:#a3a3a3;">·</span> ')}</div>`
    : "";

  const linkStyle = "color:#404040;text-decoration:none;font-family:" + FONT_STACK + ";";
  const labelGlyph = (g: string) =>
    `<span style="display:inline-block;width:18px;color:#${brand};font-weight:700;text-align:left;">${g}</span>`;
  const contactRow = (glyph: string, text: string, href: string) =>
    `<tr><td style="padding:3px 0;font-size:12.5px;line-height:1.5;color:#404040;font-family:${FONT_STACK};" valign="middle">` +
      labelGlyph(glyph) +
      `<a href="${esc(href)}" style="${linkStyle}">${text}</a>` +
    `</td></tr>`;

  const contactRows: string[] = [];
  if (d.email) {
    contactRows.push(contactRow("✉", esc(d.email), `mailto:${d.email}`));
  }
  if (d.phone) {
    contactRows.push(contactRow("☎", esc(d.phone), `tel:${digitsOnly(d.phone)}`));
  }
  if (d.whatsapp) {
    // Real green WhatsApp glyph keeps brand recognition; same row geometry
    // as the unicode glyphs above for vertical alignment.
    contactRows.push(
      `<tr><td style="padding:3px 0;font-size:12.5px;line-height:1.5;color:#404040;font-family:${FONT_STACK};" valign="middle">` +
        `<span style="display:inline-block;width:18px;text-align:left;">` +
          `<img src="${brandIconPng("whatsapp", "25D366", 36)}" alt="" width="13" height="13" style="display:inline-block;vertical-align:-2px;border:0;">` +
        `</span>` +
        `<a href="${esc(waUrl(d.whatsapp))}" style="${linkStyle}">${esc(d.whatsapp)}</a>` +
      `</td></tr>`,
    );
  }
  if (d.website) {
    contactRows.push(
      contactRow("◉", esc(websiteDisplay(d.website)), normalizeWebsiteHref(d.website)),
    );
  }
  const contactsTable = contactRows.length
    ? `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;margin-top:14px;">${contactRows.join("")}</table>`
    : "";

  const infoCell =
    `<td valign="top" style="vertical-align:top;padding:0 20px 0 0;">` +
      nameLine +
      titleLine +
      contactsTable +
    `</td>`;

  // ---------------------------------------------------------------------------
  // COLUMN 3 — Tagline + Social media (right-aligned)
  // ---------------------------------------------------------------------------
  const taglineBlock = d.tagline?.trim()
    ? `<div style="font-family:${FONT_STACK};font-style:italic;font-size:13px;line-height:1.45;color:#0a0a0a;letter-spacing:-0.005em;margin-bottom:14px;">&ldquo;${esc(d.tagline.trim())}&rdquo;</div>`
    : "";

  const socialIcons = (d.socials ?? [])
    .filter((s) => s.url && s.url.trim())
    .map((s) => {
      const meta = socialMeta(s.platform);
      const href = esc(normalizeWebsiteHref(s.url));
      const iconPng = brandIconPng(meta.slug, "ffffff", 56);
      return (
        `<a href="${href}" style="display:inline-block;margin-left:6px;text-decoration:none;" aria-label="${esc(meta.label)}">` +
          `<img src="${iconPng}" alt="${esc(meta.label)}" width="30" height="30" ` +
          `style="display:block;border:0;border-radius:8px;background-color:#${meta.color};padding:7px;box-sizing:border-box;width:30px;height:30px;">` +
        `</a>`
      );
    })
    .join("");
  const socialsBlock = socialIcons
    ? `<div style="line-height:0;font-size:0;text-align:right;">${socialIcons}</div>`
    : "";

  const rightCell =
    (taglineBlock || socialsBlock)
      ? `<td valign="top" align="right" width="170" style="width:170px;vertical-align:top;text-align:right;">` +
          taglineBlock +
          socialsBlock +
        `</td>`
      : "";

  // ---------------------------------------------------------------------------
  // OUTER WRAPPER — 600px max table with a full-width brand accent bar at
  // the top. Using a table (not a div with border-top) guarantees the line
  // actually spans the whole signature width in Gmail / Outlook / Apple Mail.
  // ---------------------------------------------------------------------------
  return [
    `<table width="600" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;max-width:600px;margin-top:28px;font-family:${FONT_STACK};color:#0a0a0a;">`,
      // Full-width brand accent bar
      `<tr><td height="3" style="height:3px;line-height:3px;font-size:0;background-color:#${brand};">&nbsp;</td></tr>`,
      // Top spacer
      `<tr><td style="height:18px;line-height:18px;font-size:0;">&nbsp;</td></tr>`,
      // Main 3-column row
      `<tr><td>`,
        `<table cellpadding="0" cellspacing="0" border="0" width="100%" role="presentation" style="border-collapse:collapse;">`,
          `<tr>`,
            logoCell,
            infoCell,
            rightCell,
          `</tr>`,
        `</table>`,
      `</td></tr>`,
    `</table>`,
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
