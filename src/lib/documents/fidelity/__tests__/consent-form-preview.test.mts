import assert from "node:assert/strict";
import test from "node:test";

import { SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW } from "../consent-form-preview";

test("LSLGC consent form preview is schema-safe: no <style>, no CSS Grid, no raw inline style=", () => {
  assert.doesNotMatch(SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW, /<style/i);
  assert.doesNotMatch(SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW, /display:\s*grid/i);
  assert.doesNotMatch(SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW, / style="/);
});

test("LSLGC consent form preview opts out of the house page-number footer", () => {
  assert.match(SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW, /data-document-footer="none"/);
  assert.match(SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW, /data-accurate/);
});

test("LSLGC consent form preview reproduces the source's two-column layout with only a data-plain table (no nested <p> in a td)", () => {
  assert.match(SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW, /<table data-plain>/);
  const [, body] = SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW.split("<table data-plain>");
  const cellCount = (body.match(/<td>/g) ?? []).length;
  assert.equal(cellCount, 2, "expected exactly one two-column row");
  assert.doesNotMatch(SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW, /<td>[\s\S]*?<p[ >]/);
});

test("LSLGC consent form preview keeps the top-left wordmark and centered title", () => {
  assert.match(SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW, /<img class="doc-logo"/);
  assert.match(SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW, /<h2 data-align="center">CONSENT FORM<\/h2>/);
});

test("LSLGC consent form preview preserves every lettered/roman clause label from both sources", () => {
  for (const label of [
    "a. to make decisions relating to the establishment",
    "b. to provide, operate, process and administer",
    "c. to undertake activities related to the provision",
    "d. to provide product related services and support",
    "e. to verify the identity or authority",
    "f. for risk assessment, statistical and trend analysis",
    "g. to monitor and record calls",
    "h. for crime and fraud detection",
    "i. to enforce (including without limitation collecting amounts outstanding)",
    "j. to perform internal management",
    "k. for marketing to me/us",
    "l. to comply with any obligations",
    "m. any other transactions and/or purposes",
    "(i) to inform said Related Person/s",
    "(ii) to obtain consent from the said Related Person/s",
    "(iii) to inform LSLGC that such consent",
    "v. to suspend, withdraw or order the blocking",
  ]) {
    assert.ok(
      SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW.includes(label),
      `expected preview to include "${label}"`,
    );
  }
});

test("LSLGC consent form preview keeps the source's own wording exactly, including its own inconsistencies (not silently corrected)", () => {
  // Both retained .docx sources read "Loan Star Lending Group Corp., shall keep..."
  // (with the comma) and item (d)'s unclosed "...offered by LSLGC;" — kept as written.
  assert.match(SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW, /Loan Star Lending Group Corp\., shall keep/);
  assert.match(SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW, /\(whether such products are offered by LSLGC;/);
  // [VERIFY WORDING] both sources read "two (5) years", not "five (5) years".
  assert.match(SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW, /retained for a period of two \(5\) years/);
});

test("LSLGC consent form preview binds the borrower merge fields", () => {
  for (const token of ["{{borrowerName}}", "{{borrowerRepresentative}}", "{{coBorrowerName}}"]) {
    assert.ok(
      SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW.includes(token),
      `expected preview to bind ${token}`,
    );
  }
});

test("LSLGC consent form preview gates the corporate/individual signature blocks on a single condition each, not nested spans", () => {
  assert.match(SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW, /<span data-if="isCorporateBorrower">/);
  assert.match(SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW, /<span data-unless="isCorporateBorrower">/);
  assert.match(SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW, /<span data-if="coBorrowerName">/);
  assert.doesNotMatch(SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW, /data-if="[^"]*"[^<]*<span data-if/);
  assert.match(SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW, /Represented by:/);
  assert.match(SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW, /Authorized Signatory/);
  assert.match(SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW, /Signature Over Printed Name/);
});

test("LSLGC consent form preview does not use an underscore signature rule (source has none above the printed name)", () => {
  assert.doesNotMatch(SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW, /_{5,}<br\/>\{\{borrowerName\}\}/);
  assert.doesNotMatch(SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW, /_{5,}<br\/>\{\{borrowerRepresentative\}\}/);
  assert.doesNotMatch(SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW, /_{5,}<br\/>\{\{coBorrowerName\}\}/);
});
