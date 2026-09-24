import assert from "node:assert/strict";
import test from "node:test";

import { SOURCE_FAITHFUL_DISCLOSURE_PREVIEW } from "../disclosure-preview";

test("SF disclosure preview is schema-safe: no <style> block, no CSS Grid", () => {
  assert.doesNotMatch(SOURCE_FAITHFUL_DISCLOSURE_PREVIEW, /<style/i);
  assert.doesNotMatch(SOURCE_FAITHFUL_DISCLOSURE_PREVIEW, /display:\s*grid/i);
  assert.doesNotMatch(SOURCE_FAITHFUL_DISCLOSURE_PREVIEW, / style="/);
});

test("SF disclosure preview opts out of the house page-number footer", () => {
  assert.match(SOURCE_FAITHFUL_DISCLOSURE_PREVIEW, /data-document-footer="none"/);
  assert.match(SOURCE_FAITHFUL_DISCLOSURE_PREVIEW, /data-accurate/);
});

test("SF disclosure preview preserves every ruled source-form section", () => {
  for (const label of [
    "Total Non-Finance charges",
    "Nature",
    "Rate",
    "Amount",
    "CERTIFIED CORRECT:",
    "Co-Borrower Signature Over Printed Name",
  ]) {
    assert.match(SOURCE_FAITHFUL_DISCLOSURE_PREVIEW, new RegExp(label));
  }

  assert.match(SOURCE_FAITHFUL_DISCLOSURE_PREVIEW, /\{\{borrowerName\}\}/);
  assert.match(SOURCE_FAITHFUL_DISCLOSURE_PREVIEW, /\{\{coBorrowerName\}\}/);
  assert.match(SOURCE_FAITHFUL_DISCLOSURE_PREVIEW, /\{\{financeChargeInterest\}\}/);
});

test("SF disclosure preview address field has no truncating CSS", () => {
  assert.doesNotMatch(SOURCE_FAITHFUL_DISCLOSURE_PREVIEW, /white-space:\s*nowrap/);
  assert.match(SOURCE_FAITHFUL_DISCLOSURE_PREVIEW, /<td data-underline>\{\{address\}\}<\/td>/);
});

test("SF disclosure preview binds the computed non-finance charge line items and total", () => {
  for (const token of [
    "{{securityFee}}",
    "{{processingFee}}",
    "{{notaryFee}}",
    "{{docStamp}}",
    "{{adminCost}}",
    "{{nonFinanceCharges}}",
  ]) {
    assert.ok(
      SOURCE_FAITHFUL_DISCLOSURE_PREVIEW.includes(token),
      `expected preview to bind ${token}`,
    );
  }
});

test("SF disclosure preview shows the interest period end date and duration", () => {
  assert.match(SOURCE_FAITHFUL_DISCLOSURE_PREVIEW, /\{\{disclosureToDate\}\}/);
  assert.match(SOURCE_FAITHFUL_DISCLOSURE_PREVIEW, /\(\{\{installmentCount\}\} months\)/);
});

test("SF disclosure preview underline fields use the data-underline attribute, not inline borders", () => {
  assert.match(SOURCE_FAITHFUL_DISCLOSURE_PREVIEW, /data-underline/);
  assert.doesNotMatch(SOURCE_FAITHFUL_DISCLOSURE_PREVIEW, /border-bottom/);
});
