// Self-check for src/lib/ooo.ts. Run: node scripts/check-ooo.mjs
import assert from "node:assert/strict";
import {
  isOutOfOffice,
  resolveReturnDate,
  followupDueAt,
  wibDate,
} from "../src/lib/ooo.ts";

// Detection: headers win, subject is the fallback.
assert.equal(isOutOfOffice({ subject: "Re: Katering", autoSubmitted: "auto-replied" }), true);
assert.equal(isOutOfOffice({ subject: "Re: Katering", autoSubmitted: "no" }), false);
assert.equal(isOutOfOffice({ subject: "Automatic reply: Photobooth untuk acara X" }), true);
assert.equal(isOutOfOffice({ subject: "Balasan Otomatis: Dokumentasi acara X" }), true);
assert.equal(isOutOfOffice({ subject: "Out of Office: Re: Food tasting" }), true);
assert.equal(isOutOfOffice({ subject: "Re: Food tasting untuk tim X" }), false);
assert.equal(isOutOfOffice({ subject: "Re: x", precedence: "auto_reply" }), true);

// Return date: received 2026-10-01 10:00 WIB.
const received = Date.parse("2026-10-01T03:00:00Z");
assert.equal(wibDate(received), "2026-10-01");
assert.deepEqual(resolveReturnDate("2026-10-13", received), { until: "2026-10-13", parsed: true });
assert.deepEqual(resolveReturnDate(null, received), { until: "2026-10-08", parsed: false });
assert.deepEqual(resolveReturnDate("2026-09-20", received), { until: "2026-10-08", parsed: false }); // past
assert.deepEqual(resolveReturnDate("2027-06-01", received), { until: "2026-10-08", parsed: false }); // too far
assert.deepEqual(resolveReturnDate("garbage", received), { until: "2026-10-08", parsed: false });

// Due date: normal delay, pushed to 09:00 WIB the day after return.
const sent = "2026-09-29T03:00:00Z";
assert.equal(followupDueAt(sent, 4, null), Date.parse("2026-10-03T03:00:00Z"));
assert.equal(followupDueAt(sent, 4, "2026-10-13"), Date.parse("2026-10-14T02:00:00Z"));
assert.equal(followupDueAt(sent, 4, "2026-09-30"), Date.parse("2026-10-03T03:00:00Z")); // back before due
console.log("ooo checks passed");
