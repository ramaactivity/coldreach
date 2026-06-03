import { GoogleGenerativeAI } from "@google/generative-ai";

export type OpenerInput = {
  workspace_name: string;
  workspace_business_type: string | null;
  contact_first_name: string | null;
  contact_company: string | null;
  contact_position: string | null;
};

const MODEL_NAME = "gemini-2.5-flash";

function getClient(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY env var missing");
  return new GoogleGenerativeAI(key);
}

function buildPrompt(input: OpenerInput, language: "id" | "en"): string {
  const businessContext = describeBusinessType(
    input.workspace_business_type,
    input.workspace_name,
    language,
  );

  if (language === "en") {
    const recipientEn = [
      input.contact_first_name && `name ${input.contact_first_name}`,
      input.contact_position && `role ${input.contact_position}`,
      input.contact_company && `at ${input.contact_company}`,
    ]
      .filter(Boolean)
      .join(", ");

    return `Write 1 natural, personal opening sentence for a cold outreach email, in casual-professional English.

Sender context: ${businessContext}
Recipient: ${recipientEn || "a contact whose details are unknown"}.

IMPORTANT rules:
- ONLY 1 sentence (max 25 words).
- Tone: friendly, casual, not salesy — like a colleague chatting.
- Do NOT mention any product/offer/pitch.
- Do NOT open with "Hello" / "Hi" / "Good morning" — the greeting lives in a separate template.
- You MAY use public info about ${input.contact_company || "the recipient's company"} if you know it (general industry, business type). If unsure, focus on the recipient's role.
- AVOID specific unverifiable claims (e.g. "I saw the news about X").
- Output only the opening sentence, with NO prefix/suffix/quotes.

Good example outputs:
- "I'm genuinely impressed by the ${input.contact_position || "work"} at ${input.contact_company || "your company"} — demanding but truly important."
- "Just wanted to say, real respect for the ${input.contact_company || "your"} team staying consistent even in a tough market."

Opening sentence:`;
  }

  const recipient = [
    input.contact_first_name && `nama ${input.contact_first_name}`,
    input.contact_position && `posisi ${input.contact_position}`,
    input.contact_company && `di perusahaan ${input.contact_company}`,
  ]
    .filter(Boolean)
    .join(", ");

  return `Tulis 1 kalimat pembuka email cold outreach yang natural dan personal, dalam Bahasa Indonesia kasual-profesional.

Konteks pengirim: ${businessContext}
Penerima: ${recipient || "kontak yang belum diketahui detailnya"}.

Aturan PENTING:
- HANYA 1 kalimat (maksimal 25 kata).
- Tone: friendly, casual, gak salesy. Seperti kolega ngobrol.
- JANGAN sebut produk/jualan/penawaran apapun.
- JANGAN buka dengan "Halo" / "Hi" / "Selamat pagi" — kata pembuka itu udah ada di template terpisah.
- BOLEH gunakan info publik tentang ${input.contact_company || "perusahaan penerima"} kalau lu tau (industri umum, tipe bisnis, dll). Kalau gak tau, fokus ke posisi/role penerima.
- HINDARI klaim spesifik yang gak bisa dibuktikan (cth: "saya lihat berita X" — jangan tulis ini kalau lu gak yakin beritanya nyata).
- Output langsung kalimat pembukanya saja, TANPA prefix/suffix/quote.

Contoh output yang baik:
- "Saya tertarik banget dengan peran ${input.contact_position || "lu"} di ${input.contact_company || "perusahaan lu"} — challenging tapi penting banget."
- "Cuma mau bilang, salut dengan tim ${input.contact_company || "lu"} yang konsisten meskipun pasar lagi nantang."
- "Sebagai sesama yang kerja di Indonesia, saya kagum sama ${input.contact_company || "perusahaan"} yang masih bertahan di industri ini."

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
        temperature: 0.8,
        topP: 0.9,
        maxOutputTokens: 100,
      },
    });

    const prompt = buildPrompt(input, language);
    const result = await model.generateContent(prompt);
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
