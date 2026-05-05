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

function buildPrompt(input: OpenerInput): string {
  const businessContext = describeBusinessType(
    input.workspace_business_type,
    input.workspace_name,
  );
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
): string {
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

    const prompt = buildPrompt(input);
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
