/**
 * Website contact scraper — pure fetch + extract logic, no Supabase.
 *
 * Given a single URL we fetch the homepage plus a handful of contact/about/career
 * pages (same origin, capped), then extract emails, phones, and social links.
 *
 * It does NOT run JavaScript, so fully client-rendered SPAs with zero data in the
 * served HTML can still come back empty. To get as far as possible without a
 * headless browser we mine every static signal a modern site leaves behind:
 *   - JSON-LD / schema.org (`email`, `telephone`, `sameAs`, org `name`)
 *   - Cloudflare email-protection (`data-cfemail`) + HTML-entity obfuscation
 *   - `mailto:` / `tel:` / WhatsApp (`wa.me`) links
 *   - sitemap.xml to discover real contact/career pages
 *
 * Courtesy & legality: only publicly served pages are fetched, robots.txt
 * `Disallow: /` is honored, and the fetch count is capped. The caller is
 * responsible for a lawful basis to contact scraped parties.
 */

// Browser-like UA — many sites 403 an obvious bot. We still honor robots.txt.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const PER_REQUEST_TIMEOUT_MS = 12_000;
const RENDER_TIMEOUT_MS = 22_000; // Jina renders with a headless browser — slower.
const MAX_PAGES = 8;
const MAX_RENDER_PAGES = 2; // bound the JS-render fallback (Vercel Hobby budget)
const FETCH_CONCURRENCY = 3;
const MAX_BYTES = 3_000_000;

// A fuller Chrome fingerprint slips past naive UA-only bot blocks.
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": USER_AGENT,
  "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
  "Upgrade-Insecure-Requests": "1",
  "Sec-CH-UA": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  "Sec-CH-UA-Mobile": "?0",
  "Sec-CH-UA-Platform": '"macOS"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
};

export type ScrapedSocials = {
  linkedin?: string;
  instagram?: string;
  twitter?: string;
  facebook?: string;
  youtube?: string;
  tiktok?: string;
};

/** A single extracted lead candidate (deduped per email, or phone-only). */
export type ScrapedContact = {
  email?: string;
  name?: string;
  phone?: string;
  role?: string;
  company?: string;
  website: string;
  socials: ScrapedSocials;
  source_page: string;
  importable: boolean; // true iff an email is present (contacts.email is NOT NULL)
};

export type ScrapeResult = {
  url: string;
  fetchedPages: string[];
  contacts: ScrapedContact[];
  blocked?: boolean;
  rendered?: boolean; // a JS-render fallback (Jina) was used
  error?: string;
};

// ── URL normalization + SSRF guard ──────────────────────────────────────────

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal)$/i;

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (PRIVATE_HOST.test(h)) return true;
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd"))
    return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

export function normalizeUrl(input: string): URL | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname || !url.hostname.includes(".")) return null;
  if (isPrivateHost(url.hostname)) return null;
  return url;
}

// ── Crawl helpers ────────────────────────────────────────────────────────────

export function candidatePaths(): string[] {
  // Homepage (origin root) is fetched separately, so "/" is intentionally omitted.
  return [
    "/contact",
    "/contact-us",
    "/contacts",
    "/contactus",
    "/get-in-touch",
    "/about",
    "/about-us",
    "/team",
    "/kontak",
    "/hubungi-kami",
    "/hubungi",
    "/tentang-kami",
    "/tentang",
    "/karir",
    "/careers",
    "/support",
  ];
}

class BlockedError extends Error {
  constructor() {
    super("blocked");
    this.name = "BlockedError";
  }
}

/** Decode a response honoring its declared (or <meta>) charset, not just UTF-8. */
async function readBody(res: Response): Promise<string> {
  const full = await res.arrayBuffer();
  const buf = full.byteLength > MAX_BYTES ? full.slice(0, MAX_BYTES) : full;
  const ctype = res.headers.get("content-type") ?? "";
  let charset = (ctype.match(/charset=([^;]+)/i)?.[1] ?? "").trim().toLowerCase();
  if (!charset) {
    const head = new TextDecoder("latin1").decode(buf.slice(0, 2048));
    charset = (head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ?? "utf-8").toLowerCase();
  }
  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

/** Fetch a URL as text. `htmlOnly` rejects non-HTML responses (used for pages). */
async function rawFetch(
  url: string,
  signal: AbortSignal,
  htmlOnly: boolean,
): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal,
      headers: {
        ...BROWSER_HEADERS,
        Accept: htmlOnly
          ? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
          : "*/*",
      },
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!res.ok) {
    if (res.status === 403 || res.status === 429 || res.status === 503)
      throw new BlockedError();
    return null;
  }
  if (htmlOnly) {
    const ctype = res.headers.get("content-type") ?? "";
    if (ctype && !ctype.includes("html")) return null;
  }
  return readBody(res);
}

/**
 * JS-render fallback via Jina Reader (r.jina.ai) — free, no API key. It renders
 * the page in a headless browser and returns the post-JS HTML, which we feed to
 * the same extractors. Used only when the native fetch yields zero emails.
 */
async function fetchRendered(url: string): Promise<string | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), RENDER_TIMEOUT_MS);
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html",
        "X-Return-Format": "html", // give us rendered DOM, not markdown
        "X-Timeout": "18",
      },
    });
    if (!res.ok) return null;
    return readBody(res);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function fetchHtml(
  url: string,
  signal: AbortSignal,
): Promise<string | null> {
  return rawFetch(url, signal, true);
}

async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), PER_REQUEST_TIMEOUT_MS);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(t);
  }
}

/** Fetch HTML with one retry on a soft miss (timeout / transient). */
async function fetchPage(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const html = await withTimeout((s) => fetchHtml(url, s));
      if (html) return html;
    } catch (e) {
      if (e instanceof BlockedError) throw e;
    }
  }
  return null;
}

async function fetchTextSoft(url: string, htmlOnly = false): Promise<string | null> {
  try {
    return await withTimeout((s) => rawFetch(url, s, htmlOnly));
  } catch {
    return null;
  }
}

// ── HTML utilities ────────────────────────────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&commat;/gi, "@")
    .replace(/&period;/gi, ".")
    .replace(/&amp;/gi, "&");
}
function safeChar(code: number): string {
  return Number.isFinite(code) && code > 0 && code < 0x10ffff
    ? String.fromCharCode(code)
    : "";
}
function stripCode(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}
/** De-obfuscate "name [at] domain [dot] com" style addresses (bracketed only). */
function deobfuscate(text: string): string {
  return text
    .replace(/\s*[[(<{]\s*(?:at|@)\s*[\])>}]\s*/gi, "@")
    .replace(/\s*[[(<{]\s*(?:dot|\.)\s*[\])>}]\s*/gi, ".");
}

// ── JSON-LD / schema.org ──────────────────────────────────────────────────────

type LdHarvest = { emails: string[]; phones: string[]; socials: string[]; name?: string };

export function extractJsonLd(html: string): LdHarvest {
  const out: LdHarvest = { emails: [], phones: [], socials: [], name: undefined };
  for (const m of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    walkLd(data, out);
  }
  return out;
}

function walkLd(node: unknown, out: LdHarvest, depth = 0): void {
  if (!node || depth > 8) return;
  if (Array.isArray(node)) {
    for (const n of node) walkLd(n, out, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;

  const email = obj.email;
  if (typeof email === "string") out.emails.push(email.replace(/^mailto:/i, ""));
  const tel = obj.telephone ?? obj.phone;
  if (typeof tel === "string") out.phones.push(tel);
  const same = obj.sameAs;
  if (typeof same === "string") out.socials.push(same);
  else if (Array.isArray(same))
    for (const s of same) if (typeof s === "string") out.socials.push(s);

  const t = obj["@type"];
  const isOrg =
    typeof t === "string" &&
    /(Organization|LocalBusiness|Corporation|Company|NGO|EducationalOrganization)/i.test(t);
  if (isOrg && typeof obj.name === "string" && !out.name) out.name = obj.name;

  // Recurse into nested objects (contactPoint, @graph, address, etc.).
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") walkLd(v, out, depth + 1);
  }
}

// ── Cloudflare email protection ───────────────────────────────────────────────

export function decodeCfEmail(hex: string): string | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length < 4) return null;
  const key = parseInt(hex.slice(0, 2), 16);
  let email = "";
  for (let i = 2; i < hex.length; i += 2) {
    email += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  }
  return email;
}

function extractCfEmails(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/data-cfemail=["']([0-9a-f]+)["']/gi)) {
    const e = decodeCfEmail(m[1]);
    if (e) out.push(e);
  }
  for (const m of html.matchAll(/\/cdn-cgi\/l\/email-protection#([0-9a-f]+)/gi)) {
    const e = decodeCfEmail(m[1]);
    if (e) out.push(e);
  }
  return out;
}

// ── Email extraction ──────────────────────────────────────────────────────────

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const ASSET_EXT = /\.(png|jpe?g|gif|svg|webp|css|js|ico|woff2?|mp4|pdf)$/i;
const JUNK_DOMAIN =
  /(example\.(com|org)|sentry\.|wixpress\.com|cloudflare|googlemail-noreply|domain\.com|email\.com|yourcompany|company\.com|namamu|user@|@2x|@3x|\.png|core-js|polyfill)/i;
const JUNK_LOCAL = /^(u00|x[0-9a-f]{2}|[0-9a-f]{16,})/i; // escaped-unicode / hash leftovers

function isValidEmail(e: string): boolean {
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e)) return false;
  if (e.length > 120 || e.length < 6) return false;
  if (ASSET_EXT.test(e)) return false;
  if (JUNK_DOMAIN.test(e)) return false;
  if (JUNK_LOCAL.test(e.split("@")[0])) return false;
  // TLD must be alphabetic and sane length.
  const tld = e.split(".").pop() ?? "";
  if (!/^[a-z]{2,18}$/i.test(tld)) return false;
  return true;
}

export function extractEmails(html: string): string[] {
  const out = new Set<string>();
  const add = (raw: string) => {
    const e = raw.trim().toLowerCase();
    if (isValidEmail(e)) out.add(e);
  };

  extractJsonLd(html).emails.forEach(add);
  extractCfEmails(html).forEach(add);

  // mailto: from the raw + entity-decoded HTML.
  const decoded = decodeEntities(html);
  for (const src of [html, decoded]) {
    for (const m of src.matchAll(/mailto:([^"'?>\s]+)/gi)) {
      try {
        add(decodeURIComponent(m[1]));
      } catch {
        add(m[1]);
      }
    }
  }

  // Visible-text scan on script-stripped, de-obfuscated, entity-decoded HTML.
  const text = deobfuscate(decodeEntities(stripCode(html)));
  for (const m of text.matchAll(EMAIL_RE)) add(m[0]);

  // Hidden data: __NEXT_DATA__, __NUXT__, inline config JSON. The strict
  // validator filters minified-bundle noise; we just sweep inline scripts.
  for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const body = m[1];
    if (body.length > 800_000 || !body.includes("@")) continue;
    for (const em of body.matchAll(EMAIL_RE)) add(em[0]);
  }

  return [...out];
}

// ── Phone extraction ──────────────────────────────────────────────────────────

/** Normalize to a validated Indonesian-style number, or null. */
function normalizePhone(raw: string): string | null {
  let d = raw.replace(/[^\d+]/g, "");
  d = d.replace(/^\+/, "");
  if (d.startsWith("62")) d = "0" + d.slice(2);
  d = d.replace(/\D/g, "");
  if (d.length < 9 || d.length > 13) return null;
  if (d[0] !== "0") return null;
  if (!/[2-8]/.test(d[1])) return null; // mobile 08, landline 0[2-7]
  return d;
}

export function extractPhones(html: string): string[] {
  const out = new Set<string>();
  const add = (raw: string, trusted: boolean) => {
    // Untrusted (free text) matches must look formatted, else they're IDs.
    if (!trusted && !/[\s().\-]/.test(raw) && !raw.trim().startsWith("+")) return;
    const n = normalizePhone(raw);
    if (n) out.add(n);
  };

  extractJsonLd(html).phones.forEach((p) => add(p, true));

  for (const m of html.matchAll(/tel:([^"'>\s]+)/gi)) {
    try {
      add(decodeURIComponent(m[1]), true);
    } catch {
      add(m[1], true);
    }
  }
  // WhatsApp links carry a clean number.
  for (const m of html.matchAll(
    /(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=|whatsapp:\/\/send\?phone=|chat\.whatsapp\.com\/send\?phone=)\+?(\d{8,15})/gi,
  )) {
    add(m[1], true);
  }

  const text = decodeEntities(stripCode(html));
  for (const m of text.matchAll(/(?:\+?62|0)\d[\d\s().\-]{6,14}\d/g)) {
    add(m[0], false);
  }

  return [...out].slice(0, 15);
}

// ── Social extraction ──────────────────────────────────────────────────────────

const SOCIAL_PATTERNS: { key: keyof ScrapedSocials; re: RegExp }[] = [
  { key: "linkedin", re: /(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|in|school)\/[^\s"'<>)]+/i },
  { key: "instagram", re: /(?:www\.)?instagram\.com\/[^\s"'<>)]+/i },
  { key: "twitter", re: /(?:www\.)?(?:twitter|x)\.com\/[^\s"'<>)]+/i },
  { key: "facebook", re: /(?:www\.)?facebook\.com\/[^\s"'<>)]+/i },
  { key: "youtube", re: /(?:www\.)?youtube\.com\/(?:@|c\/|channel\/|user\/)[^\s"'<>)]+/i },
  { key: "tiktok", re: /(?:www\.)?tiktok\.com\/@[^\s"'<>)]+/i },
];

const SOCIAL_JUNK =
  /\/(sharer|share|intent|plugins|dialog|home|login|policy|privacy|tr\?|embed)/i;

function cleanSocial(raw: string): string {
  const u = raw.replace(/^https?:\/\//i, "").replace(/["'<>].*$/, "").replace(/[.,)]+$/, "");
  return `https://${u}`;
}

export function extractSocials(html: string): ScrapedSocials {
  const socials: ScrapedSocials = {};
  const candidates = [...extractJsonLd(html).socials, html];
  // First mine sameAs URLs (high signal), then fall back to a whole-page scan.
  for (const { key, re } of SOCIAL_PATTERNS) {
    if (socials[key]) continue;
    for (const src of candidates) {
      const m = src.match(re);
      if (m && !SOCIAL_JUNK.test(m[0])) {
        socials[key] = cleanSocial(m[0]);
        break;
      }
    }
  }
  return socials;
}

// ── Org name / links / sitemap ────────────────────────────────────────────────

function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (!m) return undefined;
  return decodeEntities(m[1]).trim().split(/[|·–—-]/)[0].trim() || undefined;
}

function extractOrgName(html: string): string | undefined {
  return extractJsonLd(html).name?.trim() || extractTitle(html);
}

const CONTACT_KEYWORD =
  /(contact|kontak|about|tentang|team|hubungi|karir|career|jobs|lowongan)/i;

export function discoverLinks(html: string, origin: URL): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    const href = m[1].trim();
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    let abs: URL;
    try {
      abs = new URL(href, origin);
    } catch {
      continue;
    }
    if (abs.origin !== origin.origin) continue;
    if (CONTACT_KEYWORD.test(abs.pathname)) out.add(abs.toString());
  }
  return [...out];
}

/** Pull contact/about/career page URLs out of sitemap.xml (+ one index level). */
async function discoverFromSitemap(origin: URL): Promise<string[]> {
  const seen: string[] = [];
  const root = await fetchTextSoft(new URL("/sitemap.xml", origin).toString());
  if (!root) return [];
  const topLocs = [...root.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);

  const pageLocs: string[] = [];
  const subSitemaps = topLocs.filter((u) => /sitemap[^/]*\.xml/i.test(u));
  if (subSitemaps.length > 0) {
    for (const sm of subSitemaps.slice(0, 2)) {
      const sub = await fetchTextSoft(sm);
      if (sub)
        for (const m of sub.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi))
          pageLocs.push(m[1]);
    }
  } else {
    pageLocs.push(...topLocs);
  }

  for (const loc of pageLocs) {
    try {
      const u = new URL(loc);
      if (u.origin === origin.origin && CONTACT_KEYWORD.test(u.pathname))
        seen.push(u.toString());
    } catch {
      /* skip */
    }
    if (seen.length >= 6) break;
  }
  return seen;
}

// ── Merge ─────────────────────────────────────────────────────────────────────

function mergeSocials(a: ScrapedSocials, b: ScrapedSocials): ScrapedSocials {
  return { ...a, ...b };
}

export function mergeContacts(parts: ScrapedContact[]): ScrapedContact[] {
  const byKey = new Map<string, ScrapedContact>();
  for (const c of parts) {
    const key = c.email ?? (c.phone ? `tel:${c.phone}` : `anon:${c.source_page}`);
    const existing = byKey.get(key);
    if (existing) {
      existing.socials = mergeSocials(existing.socials, c.socials);
      existing.phone = existing.phone ?? c.phone;
      existing.company = existing.company ?? c.company;
      existing.name = existing.name ?? c.name;
    } else {
      byKey.set(key, { ...c, socials: { ...c.socials } });
    }
  }
  return [...byKey.values()].sort(
    (a, b) => Number(b.importable) - Number(a.importable),
  );
}

// ── robots.txt ──────────────────────────────────────────────────────────────

async function robotsDisallowsAll(origin: URL): Promise<boolean> {
  const txt = await fetchTextSoft(new URL("/robots.txt", origin).toString());
  if (!txt) return false;
  const blocks = txt.split(/\n(?=user-agent:)/i);
  for (const block of blocks) {
    if (!/user-agent:\s*\*/i.test(block)) continue;
    if (/^\s*disallow:\s*\/\s*$/im.test(block)) return true;
  }
  return false;
}

// ── Orchestrator ────────────────────────────────────────────────────────────

export async function scrapeWebsite(rawUrl: string): Promise<ScrapeResult> {
  const origin = normalizeUrl(rawUrl);
  if (!origin) {
    return {
      url: rawUrl,
      fetchedPages: [],
      contacts: [],
      error:
        "URL tidak valid. Masukkan domain publik (mis. contoh.co.id) — alamat lokal/IP privat ditolak.",
    };
  }
  const originStr = `${origin.protocol}//${origin.host}`;

  if (await robotsDisallowsAll(origin)) {
    return {
      url: originStr,
      fetchedPages: [],
      contacts: [],
      blocked: true,
      error: "Situs ini melarang crawling otomatis (robots.txt).",
    };
  }

  let homeHtml: string | null;
  try {
    homeHtml = await fetchPage(originStr);
  } catch (e) {
    if (e instanceof BlockedError) {
      return {
        url: originStr,
        fetchedPages: [],
        contacts: [],
        blocked: true,
        error: "Situs memblokir akses otomatis (403/429/503). Coba situs lain.",
      };
    }
    homeHtml = null;
  }
  if (!homeHtml) {
    return {
      url: originStr,
      fetchedPages: [],
      contacts: [],
      error:
        "Tidak bisa mengambil halaman (timeout, bukan HTML, atau diblokir). Situs mungkin sepenuhnya di-render JavaScript.",
    };
  }

  const company = extractOrgName(homeHtml);

  // Page queue: discovered links ∪ sitemap hits ∪ guessed candidate paths.
  const queue = new Set<string>([originStr]);
  for (const link of discoverLinks(homeHtml, origin)) {
    if (queue.size >= MAX_PAGES) break;
    queue.add(link);
  }
  if (queue.size < MAX_PAGES) {
    for (const link of await discoverFromSitemap(origin)) {
      if (queue.size >= MAX_PAGES) break;
      queue.add(link);
    }
  }
  for (const p of candidatePaths()) {
    if (queue.size >= MAX_PAGES) break;
    queue.add(new URL(p, origin).toString());
  }
  const pages = [...queue].slice(0, MAX_PAGES);

  const fetchedPages: string[] = [originStr];
  const candidates: ScrapedContact[] = [];
  const sitePhones = new Set<string>();
  let siteSocials: ScrapedSocials = {};

  const harvest = (html: string, pageUrl: string) => {
    extractPhones(html).forEach((p) => sitePhones.add(p));
    siteSocials = mergeSocials(siteSocials, extractSocials(html));
    for (const email of extractEmails(html)) {
      candidates.push({
        email,
        website: originStr,
        company,
        socials: {},
        source_page: pageUrl,
        importable: true,
      });
    }
  };
  harvest(homeHtml, originStr);

  // Fetch the rest with bounded concurrency; misses are skipped, not fatal.
  const rest = pages.filter((p) => p !== originStr);
  for (let i = 0; i < rest.length; i += FETCH_CONCURRENCY) {
    const batch = rest.slice(i, i + FETCH_CONCURRENCY);
    const htmls = await Promise.all(
      batch.map((u) => fetchPage(u).catch(() => null)),
    );
    htmls.forEach((html, j) => {
      if (html) {
        fetchedPages.push(batch[j]);
        harvest(html, batch[j]);
      }
    });
  }

  // Assemble emails → importable contacts; fall back to phone/social-only info.
  const assemble = (): ScrapedContact[] => {
    const phoneArr = [...sitePhones];
    const out = mergeContacts(candidates).map((c) => ({
      ...c,
      company: c.company ?? company,
      socials: mergeSocials(siteSocials, c.socials),
      phone: c.phone ?? phoneArr[0],
    }));
    if (out.length > 0) return out;
    const hasSocials = Object.keys(siteSocials).length > 0;
    if (phoneArr.length > 0) {
      return phoneArr.map((phone) => ({
        phone,
        website: originStr,
        company,
        socials: siteSocials,
        source_page: originStr,
        importable: false,
      }));
    }
    if (hasSocials) {
      return [
        {
          website: originStr,
          company,
          socials: siteSocials,
          source_page: originStr,
          importable: false,
        },
      ];
    }
    return [];
  };

  let contacts = assemble();

  // JS-render fallback: only when native crawl found NO email. Render the
  // homepage and (if any) one contact page via Jina, then re-extract.
  let rendered = false;
  if (contacts.filter((c) => c.importable).length === 0) {
    const targets = [
      originStr,
      ...pages.filter((p) => p !== originStr && CONTACT_KEYWORD.test(p)),
    ].slice(0, MAX_RENDER_PAGES);
    for (const pg of targets) {
      const html = await fetchRendered(pg);
      if (html) {
        rendered = true;
        if (!fetchedPages.includes(pg)) fetchedPages.push(pg);
        harvest(html, pg);
      }
    }
    if (rendered) contacts = assemble();
  }

  return { url: originStr, fetchedPages, contacts, rendered };
}
