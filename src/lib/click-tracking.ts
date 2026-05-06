import crypto from "node:crypto";

/**
 * HMAC-SHA256 signature for click-tracking redirect URLs. Prevents the
 * /api/track/click endpoint from being abused as an open-redirect:
 * incoming requests must carry a signature that matches the original
 * URL we placed in the email.
 *
 * Truncated to 16 chars (96 bits) — collision-resistant enough for this
 * non-cryptographic use case while keeping the email body short.
 */
const SIG_LEN = 16;

function getSecret(): string {
  const secret =
    process.env.ENCRYPTION_KEY ?? process.env.CRON_SECRET ?? "coldreach-dev";
  return secret;
}

export function signClickUrl(url: string): string {
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(url)
    .digest("base64url");
  return sig.slice(0, SIG_LEN);
}

export function verifyClickSignature(url: string, sig: string): boolean {
  if (!sig || sig.length !== SIG_LEN) return false;
  const expected = signClickUrl(url);
  // timing-safe compare
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Build a tracking redirect href for embedding in email HTML.
 * Format: {base}?u=<urlencoded>&s=<sig>
 */
export function buildClickTrackingHref(
  base: string,
  originalUrl: string,
): string {
  const sig = signClickUrl(originalUrl);
  return `${base}?u=${encodeURIComponent(originalUrl)}&s=${sig}`;
}
