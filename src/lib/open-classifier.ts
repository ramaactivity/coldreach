/**
 * Open / click event classification — separates real human engagement from
 * machine traffic so the dashboard's open & click rates reflect reality.
 *
 * Why this exists: a tracking pixel fires whenever ANY client fetches the
 * image, and in cold-outreach to corporate inboxes the overwhelming majority
 * of those fetches are machines, not people:
 *   - Mail-security scanners (Microsoft Defender/ATP, Proofpoint, Mimecast,
 *     Barracuda…) fetch every image + follow every link at delivery time.
 *   - Apple Mail Privacy Protection pre-loads all images via Apple's proxy.
 *   - Gmail / Yahoo image proxies cache the pixel.
 *   - Link-preview bots (Slack, WhatsApp, social) and scripts.
 *
 * Production histogram (time between send and first pixel hit) showed ~87% of
 * all opens landing in a 5–60s spike right after send, then collapsing off a
 * cliff — the genuine human tail only begins after ~60s. So the single most
 * reliable signal is timing: an open that arrives within OPEN_HUMAN_MIN_MS of
 * the send is a delivery-time machine scan, regardless of how human its
 * user-agent looks. A user-agent blocklist catches the few machines that
 * arrive later but self-identify.
 */

export type OpenKind = "human" | "proxy_prefetch" | "bot";

/**
 * Opens/clicks arriving sooner than this after send are treated as
 * delivery-time machine scans (scanner, MPP/proxy prefetch), not a person.
 * Backed by the production timing histogram — see migration 0029. Tune here
 * if the upstream scanner behaviour changes; the SQL backfill uses the same
 * 60s boundary.
 */
export const OPEN_HUMAN_MIN_MS = 60_000;

/**
 * User-agents that are NEVER a human reading the email: scripts, crawlers,
 * link-preview bots, and security scanners that self-identify. Deliberately
 * does NOT include the Gmail/Yahoo image proxies (`GoogleImageProxy`,
 * `YahooMailProxy`) — those also carry genuine human opens, so we let the
 * timing rule judge them instead of blanket-dropping real Gmail readers.
 */
const BOT_UA_RE =
  /(barracuda|mimecast|proofpoint|messagelabs|symantec|forcepoint|fireeye|cloudmark|spamhaus|trendmicro|safelinks|slackbot|facebookexternalhit|twitterbot|telegrambot|whatsapp|linkedinbot|discordbot|googlebot|bingbot|yandexbot|applebot|python-requests|curl\/|wget\/|go-http-client|java\/|okhttp|libwww-perl|headlesschrome|phantomjs|crawler|spider|\bbot\b)/i;

export type OpenSignals = {
  userAgent: string | null | undefined;
  /** ms between the email's sent_at and this event; null if sent_at unknown. */
  msSinceSent: number | null;
};

/**
 * Classify a pixel/redirect hit. Only `"human"` should count toward open/click
 * rates, engagement scores, and status transitions.
 */
export function classifyOpenEvent({
  userAgent,
  msSinceSent,
}: OpenSignals): OpenKind {
  if (userAgent && BOT_UA_RE.test(userAgent)) return "bot";
  if (msSinceSent !== null && msSinceSent >= 0 && msSinceSent < OPEN_HUMAN_MIN_MS) {
    return "proxy_prefetch";
  }
  return "human";
}

/** Convenience: ms between a sent_at ISO string and now, or null. */
export function msSinceSent(sentAt: string | null | undefined): number | null {
  if (!sentAt) return null;
  const t = Date.parse(sentAt);
  if (Number.isNaN(t)) return null;
  return Date.now() - t;
}
