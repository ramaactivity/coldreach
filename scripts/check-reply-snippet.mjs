// Self-check for src/lib/reply-snippet.ts. Run: node scripts/check-reply-snippet.mjs
import assert from "node:assert/strict";
import { replySnippet } from "../src/lib/reply-snippet.ts";

// Gmail quote header wrapped over two lines.
assert.equal(
  replySnippet("Boleh, kirim pricelistnya.\n\nOn Wed, 1 Oct 2026 at 09:12, Rama <rama@tetraphoto.com>\nwrote:\n> Halo Bapak/Ibu,\n> lama"),
  "Boleh, kirim pricelistnya.",
);
// Indonesian Gmail header.
assert.equal(
  replySnippet("Terima kasih\nPada Rab, 1 Okt 2026 pukul 09.12 Rama <r@x.com> menulis:\n> isi"),
  "Terima kasih",
);
// Outlook header block.
assert.equal(
  replySnippet("Silakan hubungi GA kami.\r\n\r\n________________________________\r\nFrom: Rama\r\nSent: Wednesday"),
  "Silakan hubungi GA kami.",
);
// Inline ">" lines dropped, blank runs collapsed, cap applied.
assert.equal(replySnippet("a\n> b\n\n\n\nc"), "a\n\nc");
assert.equal(replySnippet("x".repeat(3000)).length, 2000);
console.log("check-reply-snippet: ok");
