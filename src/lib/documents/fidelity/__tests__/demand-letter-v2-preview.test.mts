import assert from "node:assert/strict";
import test from "node:test";

import { SOURCE_FAITHFUL_DEMAND_LETTER_V2_PREVIEW } from "../demand-letter-v2-preview";

test("demand_letter_v2 preview is schema-safe: no <style>, no CSS Grid, no raw inline style=", () => {
  assert.doesNotMatch(SOURCE_FAITHFUL_DEMAND_LETTER_V2_PREVIEW, /<style/i);
  assert.doesNotMatch(SOURCE_FAITHFUL_DEMAND_LETTER_V2_PREVIEW, /display:\s*grid/i);
  assert.doesNotMatch(SOURCE_FAITHFUL_DEMAND_LETTER_V2_PREVIEW, / style="/);
});

test("demand_letter_v2 preview opts out of the house page-number footer", () => {
  assert.match(SOURCE_FAITHFUL_DEMAND_LETTER_V2_PREVIEW, /data-document-footer="none"/);
  assert.match(SOURCE_FAITHFUL_DEMAND_LETTER_V2_PREVIEW, /data-accurate/);
});

test("demand_letter_v2 preview carries both the Second Notice and Final Notice pages", () => {
  for (const label of [
    "RE: SECOND NOTICE TO PAY",
    "RE: FINAL NOTICE TO PAY",
    "FINAL DEMAND LETTER",
    "This notice will serve as a warning.",
    "This FINAL DEMAND LETTER will serve as your final warning.",
    "Collection Department",
    "Signature Over Printed Name",
  ]) {
    assert.ok(
      SOURCE_FAITHFUL_DEMAND_LETTER_V2_PREVIEW.includes(label),
      `expected preview to include "${label}"`,
    );
  }
});

test("demand_letter_v2 preview binds the borrower/loan/demand merge fields", () => {
  for (const token of [
    "{{borrowerName}}",
    "{{address}}",
    "{{loanAccountNo}}",
    "{{firstNoticeDate}}",
    "{{monthsPastDue}}",
    "{{outstandingBalance}}",
    "{{penaltyAmount}}",
    "{{totalAmountDue}}",
    "{{attentionName}}",
    "{{attentionTitle}}",
  ]) {
    assert.ok(
      SOURCE_FAITHFUL_DEMAND_LETTER_V2_PREVIEW.includes(token),
      `expected preview to bind ${token}`,
    );
  }
});

test("demand_letter_v2 preview gates the address box and attention line on their own flags", () => {
  assert.match(SOURCE_FAITHFUL_DEMAND_LETTER_V2_PREVIEW, /<span data-if="hasAddress">\{\{address\}\}<\/span>/);
  assert.match(SOURCE_FAITHFUL_DEMAND_LETTER_V2_PREVIEW, /<span data-unless="hasAddress">&nbsp;<\/span>/);
  assert.match(SOURCE_FAITHFUL_DEMAND_LETTER_V2_PREVIEW, /<div data-if="hasAttentionLine">/);
});
