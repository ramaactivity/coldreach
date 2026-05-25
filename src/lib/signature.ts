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
  const brand = (d.brand_color || opts.fallbackBrandColor || "#f59e0b").replace("#", "");
  const linkReset = `color:inherit;text-decoration:none;`;

  // ---------------------------------------------------------------------------
  // LEFT COLUMN — Dominant logo (25%)
  // weserv letterboxes any aspect ratio into a 240px PNG; displayed at 110px
  // width so square / landscape / portrait logos all render without cropping.
  // border-right is the vertical divider; padding-right keeps it breathing.
  // ---------------------------------------------------------------------------
  const logoCell = d.logo_url
    ? `<td width="25%" align="center" valign="middle" style="width:25%;padding:8px 20px 8px 0;border-right:1px solid #cbd5e1;">` +
        `<img src="${esc(proxyLogoUrl(d.logo_url, 240))}" alt="${esc(d.company || d.name || "Logo")}" width="110" style="display:block;border:0;width:110px;max-width:100%;height:auto;margin:0 auto;">` +
      `</td>`
    : `<td width="25%" valign="middle" style="width:25%;padding:8px 20px 8px 0;border-right:1px solid #cbd5e1;">&nbsp;</td>`;

  // ---------------------------------------------------------------------------
  // RIGHT COLUMN — Top row: identity (left) + tagline & socials (right)
  // ---------------------------------------------------------------------------
  const nameLine = d.name
    ? `<div style="font-family:${FONT_STACK};font-weight:700;font-size:18px;line-height:1.2;color:#0a0a0a;letter-spacing:-0.015em;">${esc(d.name)}</div>`
    : "";

  const titleParts: string[] = [];
  if (d.title) titleParts.push(`<span style="color:#0a0a0a;font-weight:500;">${esc(d.title)}</span>`);
  if (d.company) titleParts.push(`<span style="color:#525252;">${esc(d.company)}</span>`);
  const titleLine = titleParts.length
    ? `<div style="font-family:${FONT_STACK};font-size:13px;line-height:1.4;margin-top:5px;color:#525252;">${titleParts.join(' <span style="color:#a3a3a3;">·</span> ')}</div>`
    : "";

  const identityCell =
    `<td align="left" valign="top" style="vertical-align:top;">` +
      nameLine +
      titleLine +
    `</td>`;

  // Socials → small brand-colored icon row, pushed flush right.
  const socialIcons = (d.socials ?? [])
    .filter((s) => s.url && s.url.trim())
    .map((s) => {
      const meta = socialMeta(s.platform);
      const href = esc(normalizeWebsiteHref(s.url));
      const iconPng = brandIconPng(meta.slug, "ffffff", 56);
      return (
        `<a href="${href}" style="display:inline-block;margin-left:6px;text-decoration:none;" aria-label="${esc(meta.label)}">` +
          `<img src="${iconPng}" alt="${esc(meta.label)}" width="28" height="28" ` +
          `style="display:inline-block;border:0;border-radius:7px;background-color:#${meta.color};padding:6px;box-sizing:border-box;">` +
        `</a>`
      );
    })
    .join("");
  const socialsBlock = socialIcons
    ? `<div style="line-height:0;font-size:0;text-align:right;">${socialIcons}</div>`
    : "";

  const taglineBlock = d.tagline?.trim()
    ? `<div style="font-family:${FONT_STACK};font-style:italic;font-size:12px;line-height:1.4;color:#525252;margin-top:8px;letter-spacing:-0.005em;text-align:right;">&ldquo;${esc(d.tagline.trim())}&rdquo;</div>`
    : "";

  const socialCell =
    socialsBlock || taglineBlock
      ? `<td align="right" valign="top" style="vertical-align:top;text-align:right;">` +
          socialsBlock +
          taglineBlock +
        `</td>`
      : `<td align="right" valign="top" style="vertical-align:top;">&nbsp;</td>`;

  // ---------------------------------------------------------------------------
  // RIGHT COLUMN — Bottom row: colored contact bar
  // Single TD with a horizontal table inside. Each contact item is its own
  // <td> so we can render real WhatsApp glyph as an inline <img>. Items use
  // align="center" inside their cells; white text inherits to unicode glyphs.
  // ---------------------------------------------------------------------------
  const barLinkStyle = `color:#ffffff;text-decoration:none;font-family:${FONT_STACK};font-size:11.5px;line-height:1.4;`;
  const barCellStyle = `padding:9px 8px;color:#ffffff;font-family:${FONT_STACK};font-size:11.5px;line-height:1.4;vertical-align:middle;`;

  const barCells: string[] = [];
  if (d.email) {
    barCells.push(
      `<td align="center" valign="middle" style="${barCellStyle}">` +
        `<a href="mailto:${esc(d.email)}" style="${barLinkStyle}">` +
          `<span style="color:#ffffff;margin-right:4px;">✉</span>${esc(d.email)}` +
        `</a>` +
      `</td>`,
    );
  }
  if (d.phone) {
    barCells.push(
      `<td align="center" valign="middle" style="${barCellStyle}">` +
        `<a href="tel:${digitsOnly(d.phone)}" style="${barLinkStyle}">` +
          `<span style="color:#ffffff;margin-right:4px;">☎</span>${esc(d.phone)}` +
        `</a>` +
      `</td>`,
    );
  }
  if (d.whatsapp) {
    barCells.push(
      `<td align="center" valign="middle" style="${barCellStyle}">` +
        `<a href="${esc(waUrl(d.whatsapp))}" style="${barLinkStyle}">` +
          `<img src="${brandIconPng("whatsapp", "ffffff", 36)}" alt="" width="11" height="11" style="display:inline-block;vertical-align:-1px;margin-right:5px;border:0;">` +
          `${esc(d.whatsapp)}` +
        `</a>` +
      `</td>`,
    );
  }
  if (d.website) {
    barCells.push(
      `<td align="center" valign="middle" style="${barCellStyle}">` +
        `<a href="${esc(normalizeWebsiteHref(d.website))}" style="${barLinkStyle}">` +
          `<span style="color:#ffffff;margin-right:4px;">◉</span>${esc(websiteDisplay(d.website))}` +
        `</a>` +
      `</td>`,
    );
  }

  const contactBar = barCells.length
    ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" bgcolor="#${brand}" style="width:100%;border-collapse:separate;background-color:#${brand};border-radius:8px;">` +
        `<tr>${barCells.join("")}</tr>` +
      `</table>`
    : "";

  // ---------------------------------------------------------------------------
  // ASSEMBLE the right column (top row + spacer + bottom contact bar)
  // ---------------------------------------------------------------------------
  const rightColumnInner =
    `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%;border-collapse:collapse;">` +
      // Top row: identity + socials/tagline split
      `<tr><td>` +
        `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%;border-collapse:collapse;">` +
          `<tr>${identityCell}${socialCell}</tr>` +
        `</table>` +
      `</td></tr>` +
      // Spacer between identity and contact bar
      (contactBar ? `<tr><td style="height:16px;line-height:16px;font-size:0;">&nbsp;</td></tr>` : "") +
      // Bottom row: colored contact bar
      (contactBar ? `<tr><td>${contactBar}</td></tr>` : "") +
    `</table>`;

  // ---------------------------------------------------------------------------
  // MASTER TABLE — 100% width up to 700px max. Two columns: logo + content.
  // ---------------------------------------------------------------------------
  return [
    `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%;max-width:700px;border-collapse:collapse;background-color:#ffffff;font-family:${FONT_STACK};color:#0a0a0a;margin-top:24px;">`,
      `<tr>`,
        logoCell,
        `<td width="75%" valign="middle" style="width:75%;padding:0 0 0 20px;vertical-align:middle;">`,
          rightColumnInner,
        `</td>`,
      `</tr>`,
    `</table>`,
    // Reset any cascading link styles below the signature.
    `<div style="display:none;color:transparent;font-size:0;line-height:0;max-height:0;overflow:hidden;">${linkReset}</div>`,
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
