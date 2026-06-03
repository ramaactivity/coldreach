/**
 * Website contact scraper — pure fetch + extract logic, no Supabase.
 *
 * Given a single URL we fetch the homepage plus a few common contact/about
 * pages (same origin, capped), then pull emails, phones, and social links out
 * of the raw HTML with regex. No headless browser, no new dependency.
 *
 * Courtesy & legality: we only fetch publicly served pages, send a descriptive
 * User-Agent, honor a `Disallow: /` in robots.txt, and cap our fetch count. The
 * caller is responsible for having a lawful basis to contact scraped parties.
 */

const USER_AGENT = "ColdReachBot/1.0 (+https://coldreach.app)";
const PER_REQUEST_TIMEOUT_MS = 8_000;
const MAX_PAGES = 5; // homepage + up to 4 discovered/candidate pages
const MAX_BYTES = 2_000_000; // 2 MB body cap

export type ScrapedSocials = {
  linkedin?: string;
  instagram?: string;
  twitter?: string;
  facebook?: string;
};

/** A single extracted lead candidate (deduped per email, or phone-only). */
export type ScrapedContact = {
  email?: string; // lowercased; undefined => phone/social-only (not importable)
  name?: string;
  phone?: string;
  role?: string;
  company?: string; // from <title> / domain
  website: string; // origin we scraped (https://host)
  socials: ScrapedSocials;
  source_page: string; // which fetched URL this came from
  importable: boolean; // true iff an email is present (contacts.email is NOT NULL)
};

export type ScrapeResult = {
  url: string; // normalized origin
  fetchedPages: string[]; // pages we successfully fetched
  contacts: ScrapedContact[]; // importable first
  blocked?: boolean; // 403 / bot-wall / robots Disallow on homepage
  error?: string; // fatal (bad URL, total timeout, non-HTML homepage)
};

// ── URL normalization + SSRF guard ──────────────────────────────────────────

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal)$/i;

/** True for hostnames that resolve to loopback/link-local/private literals. */
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (PRIVATE_HOST.test(h)) return true;
  // IPv6 loopback / link-local / unique-local
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd"))
    return true;
  // IPv4 literal in a private/reserved range
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

/** Add https:// if scheme missing; validate; reject non-http(s) + private hosts. */
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
  if (!url.hostname || !url.hostname.includes(".")) return null; // need a TLD
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
    "/about",
    "/about-us",
    "/team",
    "/kontak",
    "/hubungi-kami",
    "/tentang-kami",
  ];
}

/** Fetch a URL, returning HTML text or null (non-200, non-HTML, too big, error). */
export async function fetchHtml(
  url: string,
  signal: AbortSignal,
): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal,
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!res.ok) {
    // Surface bot-walls to the caller via a sentinel; treat the rest as misses.
    if (res.status === 403 || res.status === 429) throw new BlockedError();
    return null;
  }
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("html")) return null;
  const len = Number(res.headers.get("content-length") ?? "0");
  if (len && len > MAX_BYTES) return null;
  const text = await res.text();
  return text.length > MAX_BYTES ? text.slice(0, MAX_BYTES) : text;
}

class BlockedError extends Error {
  constructor() {
    super("blocked");
    this.name = "BlockedError";
  }
}

// ── Extractors ────────────────────────────────────────────────────────────────

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const ASSET_EXT = /\.(png|jpe?g|gif|svg|webp|css|js|ico|woff2?)$/i;
const JUNK_DOMAIN = /(example\.com|sentry\.|wixpress\.com|\.png$|domain\.com|email\.com)/i;

export function extractEmails(html: string): string[] {
  const out = new Set<string>();
  // mailto: links are the highest-signal source.
  for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) {
    const decoded = decodeURIComponent(m[1]).trim().toLowerCase();
    if (isValidEmail(decoded)) out.add(decoded);
  }
  // Loose text scan for anything mailto missed.
  for (const m of html.matchAll(EMAIL_RE)) {
    const e = m[0].trim().toLowerCase();
    if (isValidEmail(e)) out.add(e);
  }
  return [...out];
}

function isValidEmail(e: string): boolean {
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e)) return false;
  if (ASSET_EXT.test(e)) return false;
  if (JUNK_DOMAIN.test(e)) return false;
  if (e.length > 120) return false;
  return true;
}

export function extractPhones(html: string): string[] {
  const out = new Set<string>();
  // tel: links are reliable; loose text matching is noisy so we lean on these.
  for (const m of html.matchAll(/tel:([^"'>\s]+)/gi)) {
    const p = cleanPhone(decodeURIComponent(m[1]));
    if (p) out.add(p);
  }
  // Conservative text scan: Indonesian/intl numbers starting with + or 0.
  for (const m of html.matchAll(/(?:\+62|62|0)[\d\s().\-]{7,15}\d/g)) {
    const p = cleanPhone(m[0]);
    if (p && p.replace(/\D/g, "").length >= 9) out.add(p);
  }
  return [...out].slice(0, 10);
}

function cleanPhone(raw: string): string | null {
  const trimmed = raw.replace(/[^\d+]/g, (c) => (c === "+" ? "+" : ""));
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return trimmed;
}

export function extractSocials(html: string): ScrapedSocials {
  const socials: ScrapedSocials = {};
  const grab = (re: RegExp): string | undefined => {
    const m = html.match(re);
    return m ? `https://${m[0].replace(/^https?:\/\//i, "").replace(/["'<>].*$/, "")}` : undefined;
  };
  socials.linkedin = grab(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|in|school)\/[^"'<>\s)]+/i);
  socials.instagram = grab(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/[^"'<>\s)]+/i);
  socials.twitter = grab(/(?:https?:\/\/)?(?:www\.)?(?:twitter|x)\.com\/[^"'<>\s)]+/i);
  socials.facebook = grab(/(?:https?:\/\/)?(?:www\.)?facebook\.com\/[^"'<>\s)]+/i);
  // Drop undefined keys for a clean object.
  (Object.keys(socials) as (keyof ScrapedSocials)[]).forEach(
    (k) => socials[k] === undefined && delete socials[k],
  );
  return socials;
}

const CONTACT_KEYWORD = /(contact|kontak|about|tentang|team|hubungi)/i;

/** Same-origin hrefs whose path or anchor text hints at a contact/about page. */
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

function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (!m) return undefined;
  // Trim common suffixes like " - Home | Site".
  return m[1].trim().split(/[|·–—-]/)[0].trim() || undefined;
}

// ── Merge ─────────────────────────────────────────────────────────────────────

function mergeSocials(a: ScrapedSocials, b: ScrapedSocials): ScrapedSocials {
  return { ...a, ...b };
}

/** Dedup candidates by email (fallback phone), merging socials. Importable first. */
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

// ── Orchestrator ────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string): Promise<string | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), PER_REQUEST_TIMEOUT_MS);
  try {
    return await fetchHtml(url, controller.signal);
  } finally {
    clearTimeout(t);
  }
}

/** robots.txt courtesy check — true if our crawl is disallowed site-wide. */
async function robotsDisallowsAll(origin: URL): Promise<boolean> {
  const txt = await fetchRobots(new URL("/robots.txt", origin).toString());
  if (!txt) return false;
  // Naive: look for a "User-agent: *" (or our UA) block with "Disallow: /".
  const blocks = txt.split(/\n(?=user-agent:)/i);
  for (const block of blocks) {
    if (!/user-agent:\s*(\*|coldreachbot)/i.test(block)) continue;
    if (/^\s*disallow:\s*\/\s*$/im.test(block)) return true;
  }
  return false;
}

async function fetchRobots(url: string): Promise<string | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), PER_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.text()).slice(0, 100_000);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

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

  // Fetch homepage first.
  let homeHtml: string | null;
  try {
    homeHtml = await fetchWithTimeout(originStr);
  } catch (e) {
    if (e instanceof BlockedError) {
      return {
        url: originStr,
        fetchedPages: [],
        contacts: [],
        blocked: true,
        error: "Situs memblokir bot (403/429). Coba situs lain.",
      };
    }
    homeHtml = null;
  }
  if (!homeHtml) {
    return {
      url: originStr,
      fetchedPages: [],
      contacts: [],
      error: "Tidak bisa mengambil halaman (timeout, bukan HTML, atau diblokir).",
    };
  }

  const company = extractTitle(homeHtml);

  // Build the page list: candidate paths ∪ discovered contact/about links.
  const queue = new Set<string>([originStr]);
  for (const p of candidatePaths()) {
    if (queue.size >= MAX_PAGES) break;
    queue.add(new URL(p, origin).toString());
  }
  for (const link of discoverLinks(homeHtml, origin)) {
    if (queue.size >= MAX_PAGES) break;
    queue.add(link);
  }
  const pages = [...queue].slice(0, MAX_PAGES);

  const fetchedPages: string[] = [originStr];
  const candidates: ScrapedContact[] = [];
  const sitePhones = new Set<string>();
  let siteSocials: ScrapedSocials = {};

  // Process homepage (already fetched) + fetch the rest with small concurrency.
  const harvest = (html: string, pageUrl: string) => {
    const emails = extractEmails(html);
    extractPhones(html).forEach((p) => sitePhones.add(p));
    siteSocials = mergeSocials(siteSocials, extractSocials(html));
    for (const email of emails) {
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

  const rest = pages.filter((p) => p !== originStr);
  for (let i = 0; i < rest.length; i += 2) {
    const batch = rest.slice(i, i + 2);
    const htmls = await Promise.all(
      batch.map((u) => fetchWithTimeout(u).catch(() => null)),
    );
    htmls.forEach((html, j) => {
      if (html) {
        fetchedPages.push(batch[j]);
        harvest(html, batch[j]);
      }
    });
  }

  const phoneArr = [...sitePhones];
  let contacts: ScrapedContact[] = mergeContacts(candidates).map((c) => ({
    ...c,
    company: c.company ?? company,
    socials: mergeSocials(siteSocials, c.socials),
    phone: c.phone ?? phoneArr[0],
  }));

  // No email anywhere → surface phone/social-only info (not importable).
  if (contacts.length === 0) {
    const hasSocials = Object.keys(siteSocials).length > 0;
    if (phoneArr.length > 0) {
      contacts = phoneArr.map((phone) => ({
        phone,
        website: originStr,
        company,
        socials: siteSocials,
        source_page: originStr,
        importable: false,
      }));
    } else if (hasSocials) {
      contacts = [
        {
          website: originStr,
          company,
          socials: siteSocials,
          source_page: originStr,
          importable: false,
        },
      ];
    }
  }

  return { url: originStr, fetchedPages, contacts };
}
