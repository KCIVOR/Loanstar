import assert from "node:assert/strict";
import test from "node:test";

import { SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW } from "../promissory-note-preview";

test("SF promissory note preview is schema-safe: no <style> block, no CSS Grid", () => {
  assert.doesNotMatch(SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW, /<style/i);
  assert.doesNotMatch(SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW, /display:\s*grid/i);
});

test("SF promissory note preview preserves the source's key section labels, including its own typos (SUBSCRIBE, not SUBSCRIBED)", () => {
  for (const label of [
    "PROMISSORY NOTE",
    "Signature Over Borrower's Name",
    "Signature Over Co-Borrower's Name",
    "SUBSCRIBE AND SWORN",
    "Identification Card No.",
    "Doc. No.",
    "Series of",
  ]) {
    assert.ok(
      SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW.includes(label),
      `expected preview to include "${label}"`,
    );
  }
  assert.doesNotMatch(SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW, /SUBSCRIBED AND SWORN/);
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
    "{{coBorrowerName}}",
    "{{borrowerTin}}",
    "{{notaryDocNo}}",
    "{{notaryPageNo}}",
    "{{notaryBookNo}}",
    "{{notarySeries}}",
    "{{borrowerIdIssuedOn}}",
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

test("SF promissory note preview's signature and notary blocks are borderless <table data-plain>, matching the source's plain two-column layout (no grid lines)", () => {
  assert.match(SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW, /<table data-plain><tbody>/);
  assert.doesNotMatch(SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW, /<table><tbody>/);
});

test("SF promissory note preview includes the ID-issuance date the original states, with the original's 'ID. No.' label (not a bare 'TIN:')", () => {
  assert.match(SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW, /ID\. No\. TIN \{\{borrowerTin\}\}/);
  assert.match(SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW, /Issued on: \{\{borrowerIdIssuedOn\}\}/);
  assert.doesNotMatch(SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW, /TIN: \{\{borrowerTin\}\}/);
});

test("SF promissory note preview's notarization section matches the source's own hand-fill blanks (no execution-date auto-fill), per explicit 'match source exactly' request", () => {
  assert.match(
    SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW,
    /signed this Note at__________ on the ______ day of ________________, at _______________________\./,
  );
  assert.doesNotMatch(SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW, /\{\{executionPlace\}\}/);
  assert.doesNotMatch(SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW, /\{\{executionDate\}\}/);
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

test("SF promissory note preview reproduces the source's own internal typos verbatim, per the project's record-don't-reinterpret convention", () => {
  assert.match(SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW, /relative thereto, of with the requirements/);
  assert.match(SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW, /the value of this Note and any all sums/);
  assert.match(SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW, /deemed as waiver as such right/);
  assert.match(SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW, /deemed as waiver of such right/);
  assert.match(SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW, /waive all my rights, claims and\/or cause of actions/);
});
