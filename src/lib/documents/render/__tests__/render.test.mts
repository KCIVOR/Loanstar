import test from "node:test";
import assert from "node:assert/strict";

import { renderTemplateToPdf, htmlToPdf, hashPdf } from "../index";

const SAMPLE_TEMPLATE = `
<h2>ACKNOWLEDGEMENT RECEIPT</h2>
<p>Received from <b>Loan Star Lending Group Corp.</b> the amount of
<b>{{amountWords}} (Php {{amount}})</b><span data-if="isCheck">, issued through
{{bankName}} with check number {{checkNumber}}</span>.</p>
<table><tbody>
<tr><th>Check No.</th><th>Amount</th></tr>
<tr data-repeat="pdcSchedule"><td>{{checkNumber}}</td><td>{{amount}}</td></tr>
</tbody></table>
`;

const CONTEXT = {
  amountWords: "Ninety Thousand Pesos",
  amount: "90,000.00",
  isCheck: true,
  bankName: "EW-2858",
  checkNumber: "77250",
  pdcSchedule: [
    { checkNumber: "102901", amount: "17,428.20" },
    { checkNumber: "102902", amount: "17,428.20" },
  ],
};

test("renderTemplateToPdf produces a valid PDF", async () => {
  const bytes = await renderTemplateToPdf(SAMPLE_TEMPLATE, CONTEXT);
  assert.ok(bytes.length > 1000, "expected a non-trivial PDF");
  const magic = Buffer.from(bytes.subarray(0, 5)).toString("latin1");
  assert.equal(magic, "%PDF-");
});

test("output is byte-deterministic across renders (stable content hash)", async () => {
  const a = await renderTemplateToPdf(SAMPLE_TEMPLATE, CONTEXT);
  await new Promise((r) => setTimeout(r, 30));
  const b = await renderTemplateToPdf(SAMPLE_TEMPLATE, CONTEXT);
  assert.equal(
    hashPdf(a),
    hashPdf(b),
    "identical input must yield identical bytes",
  );
});

test("different data yields a different hash", async () => {
  const a = await renderTemplateToPdf(SAMPLE_TEMPLATE, CONTEXT);
  const b = await renderTemplateToPdf(SAMPLE_TEMPLATE, {
    ...CONTEXT,
    amount: "45,000.00",
  });
  assert.notEqual(hashPdf(a), hashPdf(b));
});

test("htmlToPdf renders plain merged HTML directly", async () => {
  const bytes = await htmlToPdf("<h1>Hello</h1><p>World</p>");
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString("latin1"), "%PDF-");
});

test("determinism holds across many sequential renders (no font-state leak)", async () => {
  // Guards against the shared-printer font-subset accumulation bug: render the
  // same input repeatedly, interleaving a different document, and assert every
  // render of a given input hashes identically regardless of order.
  const first = hashPdf(await renderTemplateToPdf(SAMPLE_TEMPLATE, CONTEXT));
  for (let i = 0; i < 5; i += 1) {
    await renderTemplateToPdf("<p>noise {{amount}}</p>", { amount: `${i}` });
    const again = hashPdf(await renderTemplateToPdf(SAMPLE_TEMPLATE, CONTEXT));
    assert.equal(again, first, `render #${i} diverged`);
  }
});
