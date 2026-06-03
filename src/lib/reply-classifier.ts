import { GoogleGenerativeAI } from "@google/generative-ai";

const MODEL_NAME = "gemini-2.5-flash";

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
        maxOutputTokens: 20,
      },
    });
    const prompt = buildPrompt(replyText);
    const result = await model.generateContent(prompt);
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
