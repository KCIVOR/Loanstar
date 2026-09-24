import assert from "node:assert/strict";
import test from "node:test";

import { SOURCE_FAITHFUL_LOAN_AGREEMENT_VIENOVO_PREVIEW } from "../loan-agreement-vienovo-preview";

test("loan_agreement_vienovo preview is schema-safe: no CSS Grid, no unsupported inline style=", () => {
  assert.doesNotMatch(SOURCE_FAITHFUL_LOAN_AGREEMENT_VIENOVO_PREVIEW, /<style/i);
  assert.doesNotMatch(SOURCE_FAITHFUL_LOAN_AGREEMENT_VIENOVO_PREVIEW, /display:\s*grid/i);
  // The two headings keep the legacy `style="text-align:center"` form, which
  // extensions.ts's AlignAttribute/parseAlign explicitly tolerates and
  // normalises on load (see this file's header comment) — assert only that
  // no *other* inline style sneaks in.
  const otherStyles = SOURCE_FAITHFUL_LOAN_AGREEMENT_VIENOVO_PREVIEW.match(/ style="([^"]*)"/g) ?? [];
  for (const style of otherStyles) {
    assert.match(style, /text-align:\s*center/);
  }
});

test("loan_agreement_vienovo preview keeps the Vienovo quarterly / every-2-months conditional", () => {
  assert.match(SOURCE_FAITHFUL_LOAN_AGREEMENT_VIENOVO_PREVIEW, /data-unless="isEvery2Months"> quarterly<\/span>/);
  assert.match(SOURCE_FAITHFUL_LOAN_AGREEMENT_VIENOVO_PREVIEW, /data-if="isEvery2Months">n every-two-months<\/span>/);
});

test("loan_agreement_vienovo preview's Clause 3 spells out the per-check PDC amount, matching the sibling loan_agreement template and all 3 Vienovo sources", () => {
  assert.match(
    SOURCE_FAITHFUL_LOAN_AGREEMENT_VIENOVO_PREVIEW,
    /Post-Dated Checks with each check amounting to \{\{perCheckAmountInWords\}\} \(Php \{\{perCheckAmount\}\}\) from \{\{loanStartDate\}\} until \{\{loanMaturityDate\}\}\./,
  );
});

test("loan_agreement_vienovo preview binds the core BLRI/loan merge fields", () => {
  for (const token of [
    "{{loanAccountNo}}",
    "{{companyName}}",
    "{{borrowerName}}",
    "{{principalAndCentavosInWords}}",
    "{{principal}}",
    "{{termsInWords}}",
    "{{interestRateInWords}}",
    "{{totalLoanAndCentavosInWords}}",
    "{{numberOfPdcsInWords}}",
  ]) {
    assert.ok(
      SOURCE_FAITHFUL_LOAN_AGREEMENT_VIENOVO_PREVIEW.includes(token),
      `expected preview to bind ${token}`,
    );
  }
});
