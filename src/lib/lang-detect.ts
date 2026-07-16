// Tiny heuristic to pick ID vs EN per contact when language_pref isn't
// explicitly set. Used by queue-runner / followup-runner when the
// template has both body_plain (ID) and body_plain_en variants.
//
// Approach: domain-first (Indonesian TLDs are reliable), then a small
// list of obviously-Indonesian first-name and company-name tokens as a
// fallback. We err on the side of Indonesian because that's the
// dominant audience.

const ID_TLDS = [
  ".id",
  ".co.id",
  ".or.id",
  ".ac.id",
  ".sch.id",
  ".go.id",
  ".net.id",
  ".web.id",
  ".my.id",
];

// Common Indonesian provider domains we already track in bounce-detector
// — if a contact uses one, default to Indonesian.
const ID_FREE_DOMAINS = new Set([
  "telkom.net",
  "plasa.com",
  "yahoo.co.id",
  "hotmail.co.id",
]);

// Small set of obviously-Indonesian first-name tokens (lowercase, no
// diacritics). Far from exhaustive — falls through to default 'id' if
// nothing matches, which is what we want anyway.
const ID_NAME_HINTS = new Set([
  "agung", "agus", "ahmad", "ahmadi", "ali", "andi", "anto", "ari", "arif",
  "asep", "bagas", "bagus", "bambang", "budi", "cahya", "catur", "dani",
  "deni", "dewi", "dimas", "dwi", "eka", "endang", "eko", "ervan", "fajar",
  "fitri", "galih", "gilang", "hasan", "hendra", "hendro", "imam", "indah",
  "indra", "irfan", "irwan", "ismail", "joko", "joni", "kurnia", "kurniawan",
  "lestari", "linda", "made", "mahmud", "marya", "muhamad", "muhammad",
  "ningsih", "nugroho", "nur", "nurul", "pak", "pradana", "pratama",
  "purnama", "putra", "putri", "ramadhan", "ramli", "rendra", "ria", "ridho",
  "rini", "risa", "rizki", "rizky", "santi", "sari", "septi", "siti", "sri",
  "subagja", "sudarmo", "sugeng", "sugianto", "suharto", "sukma", "sulis",
  "surya", "susanto", "syifa", "tania", "taufik", "tini", "tri", "udin",
  "wahyu", "wati", "wibowo", "widodo", "wulan", "yanti", "yoga", "yudi",
  "zaenal",
]);

// Loosely "international / English-default" markers — if a contact's
// email domain ends in one of these AND nothing in the name screams
// Indonesian, lean English. Keep this conservative.
const EN_TLD_HINTS = [".com", ".net", ".org", ".io", ".co.uk", ".co.us"];

function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}

function tokens(s: string | null | undefined): string[] {
  if (!s) return [];
  return s.toLowerCase().split(/[\s.\-_]+/).filter(Boolean);
}

/**
 * Returns the language code to use for a contact. Falls back to 'id'.
 *
 * Priority:
 *   1. Explicit language_pref on the contact row (always wins).
 *   2. Email domain ends with .id / .co.id / Indonesian provider → 'id'.
 *   3. First name contains an Indonesian-looking token → 'id'.
 *   4. Email domain on .com/.net/.io/etc and name doesn't trigger → 'en'.
 *   5. Default → 'id'.
 */
export function detectContactLanguage(contact: {
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  language_pref?: string | null;
}): "id" | "en" {
  const explicit = contact.language_pref?.toLowerCase();
  if (explicit === "id" || explicit === "en") return explicit;

  const dom = domainOf(contact.email);

  // Indonesian TLD or Indonesian free provider → ID
  if (ID_TLDS.some((suffix) => dom.endsWith(suffix))) return "id";
  if (ID_FREE_DOMAINS.has(dom)) return "id";

  // Indonesian-looking name tokens → ID
  const nameTokens = [
    ...tokens(contact.first_name),
    ...tokens(contact.last_name),
    ...tokens(contact.company),
  ];
  if (nameTokens.some((t) => ID_NAME_HINTS.has(t))) return "id";

  // International TLD without Indonesian markers → lean EN
  if (EN_TLD_HINTS.some((suffix) => dom.endsWith(suffix))) return "en";

  return "id";
}

// International consumer webmail — these are individuals, so default to
// Indonesian even though the TLD is .com. Corporate/company domains fall
// through to English in languageFromEmailDomain().
const INTL_WEBMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.id",
  "ymail.com",
  "rocketmail.com",
  "outlook.com",
  "hotmail.com",
  "hotmail.co.id",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "zoho.com",
  "mail.com",
]);

/**
 * Company-domain extractor for the per-domain daily send cap. Consumer
 * webmail (gmail/yahoo/outlook/...) returns null — individual mailboxes
 * aren't behind a shared corporate spam filter, so no cap applies there.
 */
export function corporateDomainOf(email: string): string | null {
  const dom = domainOf(email);
  if (!dom) return null;
  if (ID_FREE_DOMAINS.has(dom) || INTL_WEBMAIL_DOMAINS.has(dom)) return null;
  return dom;
}

/**
 * Automatic, zero-cost language pick from the email DOMAIN alone. This is the
 * source of truth for the send paths (queue-runner / follow-up / manual send)
 * — `language_pref` is intentionally ignored so behaviour is fully automatic
 * and never depends on per-contact tagging.
 *
 * Rules (errs toward Indonesian; English only for company domains):
 *   - Indonesian TLD / local provider     → id
 *   - International consumer webmail       → id (individuals)
 *   - Any other (corporate / intl) domain  → en  (big/international firms —
 *     people there operate in English)
 *   - Unknown / malformed                 → id
 */
export function languageFromEmailDomain(email: string): "id" | "en" {
  const dom = domainOf(email);
  if (!dom) return "id";
  if (ID_TLDS.some((suffix) => dom.endsWith(suffix))) return "id";
  if (ID_FREE_DOMAINS.has(dom)) return "id";
  if (INTL_WEBMAIL_DOMAINS.has(dom)) return "id";
  return "en";
}
