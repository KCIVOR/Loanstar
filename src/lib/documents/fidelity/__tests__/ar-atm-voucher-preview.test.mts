import assert from "node:assert/strict";
import test from "node:test";

import { SOURCE_FAITHFUL_AR_ATM_VOUCHER_PREVIEW } from "../ar-atm-voucher-preview";

test("SF AR ATM voucher preview is schema-safe: no <style>, no CSS Grid, no raw inline style=", () => {
  assert.doesNotMatch(SOURCE_FAITHFUL_AR_ATM_VOUCHER_PREVIEW, /<style/i);
  assert.doesNotMatch(SOURCE_FAITHFUL_AR_ATM_VOUCHER_PREVIEW, /display:\s*grid/i);
  assert.doesNotMatch(SOURCE_FAITHFUL_AR_ATM_VOUCHER_PREVIEW, / style="/);
});

test("SF AR ATM voucher preview opts out of the house page-number footer", () => {
  assert.match(SOURCE_FAITHFUL_AR_ATM_VOUCHER_PREVIEW, /data-document-footer="none"/);
  assert.match(SOURCE_FAITHFUL_AR_ATM_VOUCHER_PREVIEW, /data-accurate/);
});

test("SF AR ATM voucher preview preserves every source card-detail row", () => {
  for (const label of [
    "SURRENDER OF BANK ATM CARD",
    "BANK NAME",
    "CARD NUMBER",
    "PIN",
    "ACCOUNT TYPE",
    "INITIAL BALANCE",
    "REMARKS",
    "BORROWER:",
    "RECEIVED BY:",
  ]) {
    assert.ok(
      SOURCE_FAITHFUL_AR_ATM_VOUCHER_PREVIEW.includes(label),
      `expected preview to include "${label}"`,
    );
  }
});

test("SF AR ATM voucher preview binds the borrower and computed loan fields", () => {
  for (const token of [
    "{{borrowerName}}",
    "{{address}}",
    "{{totalLoanAndCentavosInWords}}",
    "{{totalLoan}}",
    "{{termsInWords}}",
    "{{monthlyAmortizationAndCentavosInWords}}",
    "{{monthlyAmortization}}",
    "{{firstPaymentDate}}",
  ]) {
    assert.ok(
      SOURCE_FAITHFUL_AR_ATM_VOUCHER_PREVIEW.includes(token),
      `expected preview to bind ${token}`,
    );
  }
});

test("SF AR ATM voucher preview gates the spouse signature block on a single data-if, not two slugs", () => {
  assert.match(SOURCE_FAITHFUL_AR_ATM_VOUCHER_PREVIEW, /data-if="hasSpouse"/);
  assert.match(SOURCE_FAITHFUL_AR_ATM_VOUCHER_PREVIEW, /SPOUSE:/);
  assert.match(SOURCE_FAITHFUL_AR_ATM_VOUCHER_PREVIEW, /\{\{spouseName\}\}/);
});

test("SF AR ATM voucher preview underline fields use the data-underline attribute, not inline borders", () => {
  assert.match(SOURCE_FAITHFUL_AR_ATM_VOUCHER_PREVIEW, /data-underline/);
  assert.doesNotMatch(SOURCE_FAITHFUL_AR_ATM_VOUCHER_PREVIEW, /border-bottom/);
});
