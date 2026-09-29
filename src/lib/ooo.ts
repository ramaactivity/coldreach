// Out-of-office handling shared by the reply poller and the follow-up runner.
// Pure functions only, so they can be checked without Gmail/DB (see
// scripts/check-ooo.mjs).

const DAY_MS = 24 * 3600 * 1000;
const WIB_OFFSET_MS = 7 * 3600 * 1000;

/** Assumed leave length when the auto-reply names no return date. */
export const OOO_DEFAULT_DAYS = 7;
/** Parsed return dates further out than this are treated as misreads. */
export const OOO_MAX_DAYS = 120;

// Subjects of vacation responders / auto-replies (EN + ID, Gmail + Outlook).
const OOO_SUBJECT_RX =
  /automatic reply|auto[- ]?reply|autoreply|auto[- ]?response|out of (the )?office|\booo\b|on leave|on vacation|on holiday|away from (the )?office|annual leave|balasan otomatis|sedang cuti|\bcuti\b|tidak di kantor|di luar kantor/i;

/**
 * True when a message is an auto-reply rather than a human answer. RFC 3834
 * Auto-Submitted (any value but "no") is set by Gmail's vacation responder and
 * Outlook's automatic replies; X-Autoreply / Precedence cover older servers.
 */
export function isOutOfOffice(msg: {
  subject?: string | null;
  autoSubmitted?: string | null;
  xAutoreply?: string | null;
  precedence?: string | null;
}): boolean {
  const auto = (msg.autoSubmitted ?? "").trim().toLowerCase();
  if (auto && auto !== "no") return true;
  if ((msg.xAutoreply ?? "").trim()) return true;
  if (/auto[_-]?reply/i.test(msg.precedence ?? "")) return true;
  return OOO_SUBJECT_RX.test(msg.subject ?? "");
}

/** YYYY-MM-DD of an instant, in WIB. */
export function wibDate(ms: number): string {
  return new Date(ms + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Validate a parsed return date against when the auto-reply arrived. Returns
 * the date to store, falling back to received + OOO_DEFAULT_DAYS when the
 * parse is missing, malformed, in the past, or implausibly far out.
 */
export function resolveReturnDate(
  parsed: string | null,
  receivedMs: number,
): { until: string; parsed: boolean } {
  const received = wibDate(receivedMs);
  const max = wibDate(receivedMs + OOO_MAX_DAYS * DAY_MS);
  if (parsed && /^\d{4}-\d{2}-\d{2}$/.test(parsed) && !Number.isNaN(Date.parse(parsed))) {
    if (parsed >= received && parsed <= max) return { until: parsed, parsed: true };
  }
  return { until: wibDate(receivedMs + OOO_DEFAULT_DAYS * DAY_MS), parsed: false };
}

/**
 * When the next follow-up may go out: the normal delay after the previous
 * send, but never before 09:00 WIB on the day after the recipient returns
 * (their first day back is spent clearing the inbox).
 */
export function followupDueAt(
  referenceIso: string,
  afterDays: number,
  oooUntil: string | null | undefined,
): number {
  const normal = new Date(referenceIso).getTime() + afterDays * DAY_MS;
  if (!oooUntil) return normal;
  const dayAfterReturn = Date.parse(`${oooUntil}T02:00:00Z`) + DAY_MS;
  return Math.max(normal, dayAfterReturn);
}
