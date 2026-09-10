import test from "node:test";
import assert from "node:assert/strict";

import { renderTemplateToPdf, hashPdf } from "../index";

/**
 * Chromium (Gotenberg) renderer — determinism + validity.
 *
 * SKIPPED unless `GOTENBERG_URL` is set, because it needs the deployed service.
 * Run against the dev service:
 *
 *   GOTENBERG_URL=https://loanstar-gotenberg.fly.dev \
 *   GOTENBERG_BASIC_AUTH_USER=loanstar GOTENBERG_BASIC_AUTH_PASS=… \
 *   npm test -- --test-name-pattern="chromium"
 *
 * The pdfmake determinism tests in `render.test.mts` stay as the always-run
 * guarantee for the current default engine; this file is the parallel guarantee
 * for the chromium path. When pdfmake is retired (Phase 6) the render.test.mts
 * ones are deleted and these become the sole coverage.
 */

const LIVE = Boolean(process.env.GOTENBERG_URL);
const opts = { engine: "chromium" as const };

const TABLE_TPL = `<h2>{{companyName}}</h2>
<table><tbody>
<tr><th>Item</th><th>Amount</th></tr>
<tr data-repeat="pdcSchedule"><td>{{checkNumber}}</td><td>{{amount}}</td></tr>
</tbody></table>`;

const HEADING_TPL = `<h1>{{companyName}}</h1><h2>Loan Agreement</h2>
<p>Borrower: {{borrowerName}}. Amount <b>{{amount}}</b>.<span data-if="isFinal"> FINAL.</span></p>`;

const CTX = {
  companyName: "Loan Star Lending Group Corp.",
  borrowerName: "Jonathan Del Poso",
  amount: "90,000.00",
  isFinal: true,
  checkNumber: "102901",
  pdcSchedule: [
    { checkNumber: "102901", amount: "17,428.20" },
    { checkNumber: "102902", amount: "17,428.20" },
  ],
};

test("chromium: produces a valid PDF", { skip: !LIVE }, async () => {
  const pdf = await renderTemplateToPdf(TABLE_TPL, CTX, opts);
  assert.ok(pdf.length > 1000);
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString("latin1"), "%PDF-");
});

test("chromium: byte-deterministic across renders", { skip: !LIVE }, async () => {
  const a = await renderTemplateToPdf(TABLE_TPL, CTX, opts);
  await new Promise((r) => setTimeout(r, 50));
  const b = await renderTemplateToPdf(TABLE_TPL, CTX, opts);
  assert.equal(hashPdf(a), hashPdf(b), "identical input must yield identical bytes");
});

test(
  "chromium: determinism holds with interleaved different documents",
  { skip: !LIVE },
  async () => {
    const first = hashPdf(await renderTemplateToPdf(TABLE_TPL, CTX, opts));
    for (let i = 0; i < 4; i += 1) {
      await renderTemplateToPdf(HEADING_TPL, { ...CTX, amount: `${i}` }, opts);
      const again = hashPdf(await renderTemplateToPdf(TABLE_TPL, CTX, opts));
      assert.equal(again, first, `render #${i} diverged`);
    }
  },
);

test("chromium: different data yields a different hash", { skip: !LIVE }, async () => {
  const a = await renderTemplateToPdf(TABLE_TPL, CTX, opts);
  const b = await renderTemplateToPdf(TABLE_TPL, { ...CTX, amount: "45,000.00" }, opts);
  assert.notEqual(hashPdf(a), hashPdf(b));
});

test("chromium: output differs from the pdfmake engine (proves the switch)", { skip: !LIVE }, async () => {
  const chromium = await renderTemplateToPdf(TABLE_TPL, CTX, opts);
  const pdfmake = await renderTemplateToPdf(TABLE_TPL, CTX, { engine: "pdfmake" });
  assert.notEqual(hashPdf(chromium), hashPdf(pdfmake));
});

/**
 * Golden hashes — pin per representative template once the dev Gotenberg is up:
 *
 *   1. run this file with GOTENBERG_URL set,
 *   2. copy the logged hashes into GOLDEN below,
 *   3. flip GOLDEN_ACTIVE to true.
 *
 * A Gotenberg image-tag bump or a `doc.woff2` change will then fail here until
 * the goldens are regenerated deliberately (with a note saying why).
 */
const GOLDEN_ACTIVE = false;
const GOLDEN: Record<string, string> = {
  table: "TODO",
  heading: "TODO",
};

test("chromium: matches pinned golden hashes", { skip: !LIVE || !GOLDEN_ACTIVE }, async () => {
  const table = hashPdf(await renderTemplateToPdf(TABLE_TPL, CTX, opts));
  const heading = hashPdf(await renderTemplateToPdf(HEADING_TPL, CTX, opts));
  console.log("[chromium golden] table  =", table);
  console.log("[chromium golden] heading=", heading);
  assert.equal(table, GOLDEN.table);
  assert.equal(heading, GOLDEN.heading);
});
