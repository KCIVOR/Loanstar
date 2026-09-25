import assert from "node:assert/strict";
import test from "node:test";

import { SOURCE_FAITHFUL_DEMAND_LETTER_SME_PREVIEW as PREVIEW } from "../demand-letter-sme-preview";

test("demand_letter_sme preview is schema-safe: no <style>, no CSS Grid, no unsupported inline style=", () => {
  assert.doesNotMatch(PREVIEW, /<style/i);
  assert.doesNotMatch(PREVIEW, /display:\s*grid/i);
  assert.doesNotMatch(PREVIEW, / style="/);
});

test("demand_letter_sme preview has no nested <p> inside a table cell", () => {
  const cellContents = PREVIEW.match(/<td[^>]*>([\s\S]*?)<\/td>/g) ?? [];
  for (const cell of cellContents) {
    assert.doesNotMatch(cell, /<p[ >]/, `table cell content must be inline-only: ${cell}`);
  }
});

test("demand_letter_sme preview renders the check schedule as a genuine bordered table with a data-repeat row, reusing the same field names as the already-published demand_letter_dishonored_check template", () => {
  assert.match(PREVIEW, /<table><tbody>/);
  assert.match(PREVIEW, /<tr data-repeat="demandChecks">/);
  for (const token of ["{{bankName}}", "{{checkNumber}}", "{{checkDate}}", "{{amount}}"]) {
    assert.ok(PREVIEW.includes(token), `expected the check row to bind ${token}`);
  }
});

test("demand_letter_sme preview keeps the source's own greeting and signature layout, not the other template's personalized/two-column version", () => {
  assert.match(PREVIEW, /Dear Sir\/Madame,/);
  assert.doesNotMatch(PREVIEW, /Dear \{\{borrowerName\}\}/);
  // Sequential single-column signature block, not a 2-column
  // "Very truly yours | Received by" table.
  assert.doesNotMatch(PREVIEW, /Very truly yours[\s\S]*<table>/);
});

test("demand_letter_sme preview binds the core borrower/company/account merge fields, all already used elsewhere (no invented fields)", () => {
  for (const token of [
    "{{borrowerName}}",
    "{{address}}",
    "{{borrowerRepresentative}}",
    "{{borrowerRepresentativeTitle}}",
    "{{companyName}}",
    "{{demandCheckAccountNo}}",
    "{{demandReason}}",
  ]) {
    assert.ok(PREVIEW.includes(token), `expected preview to bind ${token}`);
  }
  // Attention block is conditional, matching demand_letter_dishonored_check's
  // own data-if="borrowerRepresentative" convention.
  assert.match(PREVIEW, /<p data-if="borrowerRepresentative">/);
});
