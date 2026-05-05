import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "ENCRYPTION_KEY env var missing. Generate with: openssl rand -hex 32",
    );
  }
  if (hex.length !== 64) {
    throw new Error(
      `ENCRYPTION_KEY must be 64 hex chars (32 bytes). Got ${hex.length} chars.`,
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * Returns base64-encoded {iv}:{authTag}:{ciphertext}.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decrypt(payload: string): string {
  const key = getKey();
  const [ivB64, tagB64, ctB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !ctB64) {
    throw new Error("Invalid encrypted payload format");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(ctB64, "base64");
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Invalid auth tag length");
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
