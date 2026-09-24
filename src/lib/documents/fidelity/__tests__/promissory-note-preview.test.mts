import assert from "node:assert/strict";
import test from "node:test";

import { SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW } from "../promissory-note-preview";

test("SF promissory note preview is schema-safe: no <style>, no CSS Grid, no raw inline style=", () => {
  assert.doesNotMatch(SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW, /<style/i);
  assert.doesNotMatch(SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW, /display:\s*grid/i);
  assert.doesNotMatch(SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW, / style="/);
});

test("SF promissory note preview opts out of the house page-number footer", () => {
  assert.match(SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW, /data-document-footer="none"/);
  assert.match(SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW, /data-accurate/);
});

test("SF promissory note preview preserves the source's key section labels", () => {
  for (const label of [
    "PN Number:",
    "PROMISSORY NOTE",
    "BORROWER",
    "CO-BORROWER",
    "SUBSCRIBED AND SWORN TO BEFORE ME",
    "NAME",
    "VALID ID",
    "Place and Date of Issue",
    "NOTARY PUBLIC",
  ]) {
    assert.ok(
      SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW.includes(label),
      `expected preview to include "${label}"`,
    );
  }
});

test("SF promissory note preview binds the real computed loan fields", () => {
  for (const token of [
    "{{promissoryNoteNo}}",
    "{{principalAndCentavosInWords}}",
    "{{principal}}",
    "{{interestRateInWords}}",
    "{{addonMonthsInWords}}",
    "{{disclosureFromDate}}",
    "{{disclosureToDate}}",
    "{{totalLoanAndCentavosInWords}}",
    "{{totalLoan}}",
    "{{termsInWords}}",
    "{{monthlyAmortizationAndCentavosInWords}}",
    "{{monthlyAmortization}}",
    "{{firstPaymentDate}}",
    "{{loanMaturityDate}}",
    "{{executionDate}}",
    "{{borrowerName}}",
    "{{coBorrowerName}}",
    "{{notaryDocNo}}",
    "{{notaryPageNo}}",
    "{{notaryBookNo}}",
    "{{notarySeries}}",
  ]) {
    assert.ok(
      SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW.includes(token),
      `expected preview to bind ${token}`,
    );
  }
});

test("SF promissory note preview underline fields use the data-underline attribute or native <u>, not inline borders", () => {
  assert.match(SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW, /data-underline/);
  assert.doesNotMatch(SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW, /border-bottom/);
});
