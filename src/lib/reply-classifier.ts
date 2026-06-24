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
    // Gemini may wrap with quotes or add a period. Take the first
    // alphabetic+underscore token only.
    const match = raw.match(/[a-z_]+/);
    const label = match?.[0] as ReplyClass | undefined;
    if (label && VALID.has(label)) return label;
    return "other";
  } catch (err) {
    console.error("classifyReply error:", err);
    return null;
  }
}
