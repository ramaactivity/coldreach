import { GoogleGenerativeAI } from "@google/generative-ai";

export type OpenerInput = {
  workspace_name: string;
  workspace_business_type: string | null;
  contact_first_name: string | null;
  contact_company: string | null;
  contact_position: string | null;
};

// gemini-2.5-flash-lite. NOT plain 2.5-flash / flash-latest: those are thinking
// models that spend reasoning tokens out of maxOutputTokens, so the answer comes
// back truncated ("Ikut senang melih…") or empty. NOT 2.0-flash: it has zero
// free-tier quota on this project (429 limit:0). flash-lite has free quota, no
// thinking overhead, and is the cheapest/fastest tier — ideal for a
// high-volume one-sentence task.
const MODEL_NAME = "gemini-2.5-flash-lite";

// Gemini occasionally returns 503 ("high demand") / 429 / 500. A single attempt
// (the old behaviour) meant those silently produced no opener. Retry a couple
// times with backoff before giving up.
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      const retryable = status === 503 || status === 429 || status === 500;
      if (!retryable || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 400 * Math.pow(3, i)));
    }
  }
  throw lastErr;
}

function getClient(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY env var missing");
  return new GoogleGenerativeAI(key);
}

/**
 * Tidy a raw company string into the name a human would actually say: drop the
 * "PT "/"CV " legal prefix, the " Tbk." suffix, and any "(...)" parenthetical.
 * "PT Sumi Rubber Indonesia (Dunlop)" → "Sumi Rubber Indonesia". Keeps the AI
 * from echoing robotic legal names into a supposedly personal sentence.
 */
function cleanCompany(raw: string | null): string {
  if (!raw) return "";
  return raw
    .replace(/\s*\([^)]*\)/g, "") // strip "(Dunlop)" etc.
    .replace(/^(PT|CV|UD|PD)\.?\s+/i, "") // strip legal prefix
    .replace(/[, ]+Tbk\.?$/i, "") // strip " Tbk."
    .replace(/\s{2,}/g, " ")
    .trim();
}

function buildPrompt(input: OpenerInput, language: "id" | "en"): string {
  const businessContext = describeBusinessType(
    input.workspace_business_type,
    input.workspace_name,
    language,
  );
  const company = cleanCompany(input.contact_company);
  const name = input.contact_first_name?.trim() || "";
  const position = input.contact_position?.trim() || "";

  if (language === "en") {
    const recipientEn = [
      name && `name ${name}`,
      position && `role ${position}`,
      company && `at ${company}`,
    ]
      .filter(Boolean)
      .join(", ");

    return `Write ONE opening sentence for a cold outreach email that sounds like a real person typed it — for ${recipientEn || "a contact whose details are unknown"}.

Sender context: ${businessContext}

RULES:
- NO greeting or pleasantries at all (no "Hello", "Hi", "Hope you're well") — the greeting is already in the template; go straight into it.
- EXACTLY 1 sentence, max 18 words.
- Reference their role or the company's industry SPECIFICALLY, not empty flattery.
- VARY the angle every time — sometimes curiosity, sometimes an industry observation, sometimes a light question. Do NOT always start with "I'm curious".
- Use the company name as-is (${company || "their company"}); never add "Inc"/"Ltd"/parentheses.
- Do NOT mention any product/service/offer. No unverifiable specific claims.
- Output the sentence only, no quotes.

Opening sentence:`;
  }

  const recipient = [
    name && `nama ${name}`,
    position && `posisi ${position}`,
    company && `di ${company}`,
  ]
    .filter(Boolean)
    .join(", ");

  return `Tulis SATU kalimat pembuka email cold outreach yang terdengar seperti diketik manusia beneran — untuk ${recipient || "kontak yang belum diketahui detailnya"}.

Konteks pengirim: ${businessContext}

ATURAN:
- TANPA sapaan/basa-basi sama sekali — jangan "Halo", "Hai", "Selamat pagi", "Semoga sehat/harimu...". Langsung ke isi; sapaan sudah ada di template.
- PERSIS 1 kalimat, maksimal 18 kata.
- Singgung peran/posisi atau industri perusahaan secara SPESIFIK, bukan pujian kosong.
- VARIASIKAN sudut pandang tiap kali — kadang rasa penasaran, kadang observasi soal industrinya, kadang pertanyaan ringan. JANGAN selalu mulai dengan "Saya penasaran".
- Pakai nama perusahaan apa adanya (${company || "perusahaannya"}); jangan tambah "PT", "Tbk", atau tanda kurung.
- JANGAN sebut produk/jasa/penawaran. JANGAN klaim spesifik yang nggak bisa dibuktikan.
- Bahasa Indonesia, profesional tapi santai. Output: kalimatnya saja, tanpa tanda kutip.

Contoh GAYA (jangan disalin, bikin yang baru & variatif):
- "Pasti challenging ya ngatur banyak vendor sekaligus di tim sebesar ${company || "perusahaan ini"}."
- "Posisi ${position || "ini"} di ${company || "sana"} kayaknya lagi padat-padatnya menjelang akhir tahun."
- "Sering kepikiran gimana tim di ${company || "perusahaan besar"} ngatur acara internal mereka."

Kalimat pembuka:`;
}

function describeBusinessType(
  type: string | null,
  workspaceName: string,
  language: "id" | "en",
): string {
  if (language === "en") {
    switch (type) {
      case "catering":
        return `${workspaceName} — a corporate catering business doing B2B outreach`;
      case "photography":
        return `${workspaceName} — a photobooth/photography business for corporate events and weddings`;
      case "design":
        return `${workspaceName} — a design/creative studio serving corporate clients`;
      case "consulting":
        return `${workspaceName} — a consulting business`;
      default:
        return `${workspaceName} — a business doing B2B outreach`;
    }
  }
  switch (type) {
    case "catering":
      return `${workspaceName} — usaha catering corporate yang lagi mau outreach ke target B2B`;
    case "photography":
      return `${workspaceName} — usaha photobooth/photography untuk event corporate dan wedding`;
    case "design":
      return `${workspaceName} — usaha design/creative service untuk klien corporate`;
    case "consulting":
      return `${workspaceName} — usaha consulting`;
    default:
      return `${workspaceName} — usaha yang lagi mau outreach ke target B2B`;
  }
}

/**
 * Generate a 1-sentence opener using Gemini 2.5 Flash.
 * Returns null on error so caller can fallback to empty opener.
 */
export async function generateOpener(
  input: OpenerInput,
  language: "id" | "en" = "id",
): Promise<string | null> {
  try {
    const client = getClient();
    const model = client.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: {
        temperature: 0.85,
        topP: 0.9,
        // Generous headroom so a full sentence is never clipped mid-word.
        maxOutputTokens: 256,
      },
    });

    const prompt = buildPrompt(input, language);
    const result = await withRetry(() => model.generateContent(prompt));
    const text = result.response.text().trim();

    // Sanitize: take only first line/sentence, strip quotes
    let opener = text
      .replace(/^["'`*\-•\s]+/, "")
      .replace(/["'`]+$/, "")
      .split(/\n/)[0]
      .trim();

    // Limit length safety net
    if (opener.length > 250) {
      opener = opener.slice(0, 250).trim();
    }
    if (opener.length < 10) {
      return null; // suspiciously short, abandon
    }
    return opener;
  } catch (err) {
    console.error("generateOpener error:", err);
    return null;
  }
}
