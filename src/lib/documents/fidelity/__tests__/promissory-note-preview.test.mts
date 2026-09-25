import assert from "node:assert/strict";
import test from "node:test";

import { SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW } from "../promissory-note-preview";

test("SF promissory note preview is schema-safe: no <style> block, no CSS Grid", () => {
  assert.doesNotMatch(SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW, /<style/i);
  assert.doesNotMatch(SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW, /display:\s*grid/i);
});

test("SF promissory note preview preserves the source's key section labels", () => {
  for (const label of [
    "PROMISSORY NOTE",
    "Signature Over Borrower's Name",
    "Signature Over Co-Borrower's Name",
    "SUBSCRIBED AND SWORN",
    "Identification Card No.",
    "Doc. No.",
    "Series of",
  ]) {
    assert.ok(
      SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW.includes(label),
      `expected preview to include "${label}"`,
    );
  }
});

test("SF promissory note preview binds the real computed loan fields", () => {
  for (const token of [
    "{{borrowerName}}",
    "{{address}}",
    "{{companyName}}",
    "{{principalAndCentavosInWords}}",
    "{{principal}}",
    "{{termsInWords}}",
    "{{monthlyAmortizationAndCentavosInWords}}",
    "{{monthlyAmortization}}",
    "{{firstPaymentDate}}",
    "{{interestRateInWords}}",
    "{{installmentDayOrdinal}}",
    "{{executionPlace}}",
    "{{executionDate}}",
    "{{coBorrowerName}}",
    "{{borrowerTin}}",
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

test("SF promissory note preview's installment clause uses the real computed day-of-month, not a hardcoded placeholder", () => {
  assert.match(
    SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW,
    /the \{\{installmentDayOrdinal\}\} day of every month thereafter/,
  );
  assert.doesNotMatch(SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW, /the same day of every month thereafter/);
});

test("SF promissory note preview's signature and notary blocks are real <table> elements, not underline placeholders", () => {
  assert.match(SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW, /<table><tbody>/);
  assert.doesNotMatch(SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW, /data-underline/);
});

test("SF promissory note preview has all 15 numbered clauses", () => {
  for (let n = 1; n <= 15; n += 1) {
    assert.match(
      SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW,
      new RegExp(`<p>${n}\\. `),
      `expected clause ${n} to be present`,
    );
  }
});
