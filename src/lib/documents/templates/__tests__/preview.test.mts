import test from "node:test";
import assert from "node:assert/strict";

import { renderTemplateToPdf, hashPdf } from "../../render/index";
import { buildSampleContext } from "../fields";

const TEMPLATE = `
<h1>{{companyName}}</h1>
<p>Borrower: <b>{{borrowerName}}</b> — Loan {{loanAccountNo}}</p>
<p data-if="isCheck">Released via check {{checkNumber}} ({{bankName}}).</p>
<table><tbody>
<tr><th>Particular</th><th>Amount</th></tr>
<tr data-repeat="particulars"><td>{{label}}</td><td>{{amount}}</td></tr>
</tbody></table>
<table><tbody>
<tr><th>Due</th><th>Check</th><th>Amount</th></tr>
<tr data-repeat="pdcSchedule"><td>{{checkDate}}</td><td>{{checkNumber}}</td><td>{{amount}}</td></tr>
</tbody></table>
`;

test("sample context renders every catalog field type into a valid PDF", async () => {
  const bytes = await renderTemplateToPdf(TEMPLATE, buildSampleContext());
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString("latin1"), "%PDF-");
  assert.ok(bytes.length > 1500);
});

test("preview render is deterministic with the sample context", async () => {
  const ctx = buildSampleContext();
  const a = await renderTemplateToPdf(TEMPLATE, ctx);
  const b = await renderTemplateToPdf(TEMPLATE, ctx);
  assert.equal(hashPdf(a), hashPdf(b));
});
