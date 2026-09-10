import test from "node:test";
import assert from "node:assert/strict";
import { renderTemplateToPdf, hashPdf } from "../index";
import { buildSampleContext } from "@/lib/documents/templates/fields";

// Simplified template bodies (representative samples)
const TEMPLATES = {
  withTable: `<h2>{{companyName}}</h2>
    <table><tbody>
    <tr><th>Item</th><th>Amount</th></tr>
    <tr><td>Principal</td><td>{{loanAmount}}</td></tr>
    </tbody></table>`,
  
  withHeadings: `<h1>{{companyName}}</h1>
    <h2>Loan Agreement</h2>
    <p>Borrower: {{borrowerName}}</p>`,
};

test("new defaults produce valid PDFs for table template", async () => {
  const pdf = await renderTemplateToPdf(
    TEMPLATES.withTable, 
    buildSampleContext(),
    { useSharedDefaults: true }
  );
  assert.ok(pdf.length > 1000);
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString("latin1"), "%PDF-");
});

test("new defaults produce valid PDFs for heading template", async () => {
  const pdf = await renderTemplateToPdf(
    TEMPLATES.withHeadings, 
    buildSampleContext(),
    { useSharedDefaults: true }
  );
  assert.ok(pdf.length > 1000);
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString("latin1"), "%PDF-");
});

test("new defaults are deterministic", async () => {
  const a = await renderTemplateToPdf(
    TEMPLATES.withTable, 
    buildSampleContext(),
    { useSharedDefaults: true }
  );
  await new Promise(r => setTimeout(r, 50));
  const b = await renderTemplateToPdf(
    TEMPLATES.withTable, 
    buildSampleContext(),
    { useSharedDefaults: true }
  );
  assert.equal(hashPdf(a), hashPdf(b));
});

test("legacy path (no flag) unchanged", async () => {
  // Render without the flag — should match Phase 0 baseline
  const pdf = await renderTemplateToPdf(
    TEMPLATES.withTable, 
    buildSampleContext()
    // no 3rd argument
  );
  // This isn't byte-comparing to baseline (we don't have the exact body),
  // but it proves the old path still works
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString("latin1"), "%PDF-");
});
