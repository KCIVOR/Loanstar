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

// The whole point of the feature: the shared-defaults flag must actually change
// table rendering (full-width columns injected at `table.widths`). A regression
// here previously slipped through because the width spec was written to the
// wrong nesting level and pdfmake ignored it.
const TABLE_TEMPLATES = {
  headerTable: `<table><tbody>
    <tr><th>A</th><th>B</th><th>C</th></tr>
    <tr><td>1</td><td>2</td><td>3</td></tr>
    </tbody></table>`,
  twoColLayout: `<table><tbody>
    <tr><td><b>Loan Account No.:</b></td><td>LA303342</td></tr>
    <tr><td><b>Loan Type:</b></td><td>Car Refinancing</td></tr>
    </tbody></table>`,
  colspan: `<table><tbody>
    <tr><td colspan="2"><b>Address:</b> 123 Main St</td></tr>
    <tr><td>Left</td><td>Right</td></tr>
    </tbody></table>`,
};

for (const [name, body] of Object.entries(TABLE_TEMPLATES)) {
  test(`shared defaults change table output vs legacy (${name})`, async () => {
    const legacy = await renderTemplateToPdf(body, buildSampleContext());
    const shared = await renderTemplateToPdf(body, buildSampleContext(), {
      useSharedDefaults: true,
    });
    assert.notEqual(
      hashPdf(shared),
      hashPdf(legacy),
      "shared-defaults render must differ from legacy for a table template",
    );
    // ...and stay reproducible, so the signing content-hash is stable.
    const shared2 = await renderTemplateToPdf(body, buildSampleContext(), {
      useSharedDefaults: true,
    });
    assert.equal(hashPdf(shared), hashPdf(shared2));
  });
}

test("shared defaults leave non-table templates byte-identical to legacy", async () => {
  // PDF_DEFAULT_STYLES mirrors html-to-pdfmake's built-in tag defaults, so a
  // template with no table must render the same bytes with or without the flag.
  const legacy = await renderTemplateToPdf(
    TEMPLATES.withHeadings,
    buildSampleContext(),
  );
  const shared = await renderTemplateToPdf(
    TEMPLATES.withHeadings,
    buildSampleContext(),
    { useSharedDefaults: true },
  );
  assert.equal(hashPdf(shared), hashPdf(legacy));
});
