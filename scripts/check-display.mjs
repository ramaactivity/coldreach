// Self-check for displayCompany / displayPersonName (src/lib/template-helpers.ts).
// Run: node scripts/check-display.mjs
import assert from "node:assert/strict";
import { displayCompany, displayPersonName } from "../src/lib/template-helpers.ts";

const cases = {
  "INTI CAKRAWALA CITRA, PT": "Inti Cakrawala Citra",
  "PT. Bank Victoria International, Tbk": "Bank Victoria International",
  "PT IMECON TEKNINDO": "Imecon Teknindo",
  "PT Bank Negara Indonesia (Persero) Tbk": "Bank Negara Indonesia",
  "PT SANTOS JAYA ABADI (Kapal Api Global)": "Santos Jaya Abadi (Kapal Api Global)",
  "BANK BCA SYARIAH": "Bank BCA Syariah",
  "GoTo Group": "GoTo Group",
  "HSBC Indonesia": "HSBC Indonesia",
  "tiket.com": "tiket.com",
  BNI: "BNI",
};
for (const [raw, want] of Object.entries(cases)) assert.equal(displayCompany(raw), want, raw);
assert.equal(displayCompany(null), "");
assert.equal(displayPersonName("MUHAMAD PALINDANG"), "Muhamad Palindang");
assert.equal(displayPersonName("Ika Sejati"), "Ika Sejati");
console.log("display checks passed");
