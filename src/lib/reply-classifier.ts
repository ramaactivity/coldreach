import { GoogleGenerativeAI } from "@google/generative-ai";

// flash-lite, not 2.5-flash: 2.5-flash spends "thinking" tokens out of
// maxOutputTokens, so with a tiny budget the label came back empty and every
// reply silently fell through to "other" — breaking lead classification.
const MODEL_NAME = "gemini-2.5-flash-lite";

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      if ((status !== 503 && status !== 429 && status !== 500) || i === attempts - 1) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 400 * Math.pow(3, i)));
    }
  }
  throw lastErr;
}

export type ReplyClass =
  | "interested"
  | "not_interested"
  | "out_of_office"
  | "question"
  | "unsubscribe_request"
  | "other";

const VALID = new Set<ReplyClass>([
  "interested",
  "not_interested",
  "out_of_office",
  "question",
  "unsubscribe_request",
  "other",
]);

function getClient(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY env var missing");
  return new GoogleGenerativeAI(key);
}

function buildPrompt(replyText: string): string {
  return `Klasifikasikan balasan email cold outreach berikut ke salah satu dari label ini:

- interested: penerima tertarik, mau lanjut diskusi/meeting/dapat info lebih
- not_interested: penerima menolak / bilang gak butuh / gak relevan
- out_of_office: auto-reply karena lagi cuti / OOO / tidak di kantor
- question: penerima nanya detail tertentu sebelum mutusin
- unsubscribe_request: penerima minta jangan dikontak lagi / unsubscribe
- other: tidak masuk kategori di atas (forward, salah kirim, dll)

PENTING:
- Output SATU label saja, lowercase, tanpa kalimat lain.
- Jangan tambah penjelasan, kutipan, atau prefix.

Balasan email:
"""
${replyText.slice(0, 1500)}
"""

Label:`;
}

/**
 * Classify a reply body text. Returns a typed label or null on Gemini
 * failure (caller falls back to no-op so the reply still gets recorded
 * just without classification).
 */
export async function classifyReply(
  replyText: string,
): Promise<ReplyClass | null> {
  if (!replyText || replyText.trim().length === 0) return null;
  try {
    const client = getClient();
    const model = client.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 40,
      },
    });
    const prompt = buildPrompt(replyText);
    const result = await withRetry(() => model.generateContent(prompt));
    const raw = result.response.text().trim().toLowerCase();
    // Gemini may add a preamble ("label: interested") or quotes/period. Scan
    // for the first KNOWN label anywhere in the output rather than the first
    // token — otherwise "label:" itself is taken and everything falls to
    // "other".
    for (const token of raw.match(/[a-z_]+/g) ?? []) {
      if (VALID.has(token as ReplyClass)) return token as ReplyClass;
    }
    return "other";
  } catch (err) {
    console.error("classifyReply error:", err);
    return null;
  }
}

/**
 * Pull the "back in the office" date out of an out-of-office auto-reply.
 * Returns YYYY-MM-DD, or null when the text names no date or Gemini fails —
 * the caller (resolveReturnDate) then falls back to a default leave length.
 * `receivedIso` anchors relative phrases ("back next Monday", "besok").
 */
export async function extractReturnDate(
  replyText: string,
  receivedIso: string,
): Promise<string | null> {
  if (!replyText.trim()) return null;
  try {
    const model = getClient().getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: { temperature: 0, maxOutputTokens: 20 },
    });
    const prompt = `Email berikut adalah auto-reply out-of-office / cuti. Email diterima pada ${receivedIso.slice(0, 10)} (zona WIB).

Tentukan tanggal yang disebut sebagai akhir cuti ATAU tanggal kembali ke kantor (pakai yang disebut di teks, jangan ditambah/dikurangi).
- "cuti sampai 10 Oktober" / "out until Oct 10" / "back on Oct 10" → 10 Oktober.
- Rentang "from 1 Oct to 9 Oct" → tanggal akhir rentang.
- Frasa relatif ("next Monday", "besok") dihitung dari tanggal email diterima.
- Tahun tidak disebut → tahun terdekat setelah tanggal diterima.
- Tidak ada tanggal sama sekali → NONE.

Jawab HANYA format YYYY-MM-DD atau NONE.

Email:
"""
${replyText.slice(0, 1500)}
"""

Jawaban:`;
    const result = await withRetry(() => model.generateContent(prompt));
    return result.response.text().match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
  } catch (err) {
    console.error("extractReturnDate error:", err);
    return null;
  }
}
