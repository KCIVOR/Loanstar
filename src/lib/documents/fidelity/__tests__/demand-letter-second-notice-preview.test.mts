import assert from "node:assert/strict";
import test from "node:test";

import { SOURCE_FAITHFUL_DEMAND_LETTER_SECOND_NOTICE_PREVIEW } from "../demand-letter-second-notice-preview";

test("SF DL2 preview is schema-safe: no <style>, no CSS Grid, no raw inline style=", () => {
  assert.doesNotMatch(SOURCE_FAITHFUL_DEMAND_LETTER_SECOND_NOTICE_PREVIEW, /<style/i);
  assert.doesNotMatch(SOURCE_FAITHFUL_DEMAND_LETTER_SECOND_NOTICE_PREVIEW, /display:\s*grid/i);
  assert.doesNotMatch(SOURCE_FAITHFUL_DEMAND_LETTER_SECOND_NOTICE_PREVIEW, / style="/);
});

test("SF DL2 preview opts out of the house page-number footer", () => {
  assert.match(SOURCE_FAITHFUL_DEMAND_LETTER_SECOND_NOTICE_PREVIEW, /data-document-footer="none"/);
  assert.match(SOURCE_FAITHFUL_DEMAND_LETTER_SECOND_NOTICE_PREVIEW, /data-accurate/);
});

test("SF DL2 preview matches the dishonored-check source wording, not the generic past-due letter", () => {
  for (const label of [
    "Re: Dishonored check/s",
    "BANK",
    "CHECK NUMBER",
    "DATE",
    "AMOUNT",
    "dishonored and returned by the drawee bank",
    "final demand is hereby made upon you to redeem in cash",
    "Collection Department",
  ]) {
    assert.ok(
      SOURCE_FAITHFUL_DEMAND_LETTER_SECOND_NOTICE_PREVIEW.includes(label),
      `expected preview to include "${label}"`,
    );
  }
});

test("SF DL2 preview has no address block, matching the 'No address' source variant", () => {
  assert.doesNotMatch(SOURCE_FAITHFUL_DEMAND_LETTER_SECOND_NOTICE_PREVIEW, /\{\{address\}\}/);
});

test("SF DL2 preview binds the borrower/loan fields and repeats the bounced-check rows", () => {
  assert.match(SOURCE_FAITHFUL_DEMAND_LETTER_SECOND_NOTICE_PREVIEW, /\{\{borrowerName\}\}/);
  assert.match(SOURCE_FAITHFUL_DEMAND_LETTER_SECOND_NOTICE_PREVIEW, /\{\{loanAccountNo\}\}/);
  assert.match(SOURCE_FAITHFUL_DEMAND_LETTER_SECOND_NOTICE_PREVIEW, /data-repeat="bouncedChecks"/);
  for (const token of ["{{bankName}}", "{{checkNumber}}", "{{checkDate}}", "{{amount}}"]) {
    assert.ok(
      SOURCE_FAITHFUL_DEMAND_LETTER_SECOND_NOTICE_PREVIEW.includes(token),
      `expected preview to bind ${token}`,
    );
  }
});
