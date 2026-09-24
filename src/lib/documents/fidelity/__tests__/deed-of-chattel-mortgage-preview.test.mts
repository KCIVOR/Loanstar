import assert from "node:assert/strict";
import test from "node:test";

import { SOURCE_FAITHFUL_DEED_OF_CHATTEL_MORTGAGE_PREVIEW as PREVIEW } from "../deed-of-chattel-mortgage-preview";

test("deed_of_chattel_mortgage preview is schema-safe: no <style>, no CSS Grid, no unsupported inline style=", () => {
  assert.doesNotMatch(PREVIEW, /<style/i);
  assert.doesNotMatch(PREVIEW, /display:\s*grid/i);
  // The heading keeps the legacy `style="text-align:center"` form, tolerated
  // and normalised on load by extensions.ts's AlignAttribute/parseAlign (see
  // loan-agreement-vienovo-preview.ts's own header comment for the same
  // convention) — assert only that no *other* inline style sneaks in.
  const otherStyles = PREVIEW.match(/ style="([^"]*)"/g) ?? [];
  for (const style of otherStyles) {
    assert.match(style, /text-align:\s*center/);
  }
});

test("deed_of_chattel_mortgage preview has no nested <p> inside a table cell", () => {
  const cellContents = PREVIEW.match(/<td[^>]*>([\s\S]*?)<\/td>/g) ?? [];
  for (const cell of cellContents) {
    assert.doesNotMatch(cell, /<p[ >]/, `table cell content must be inline-only: ${cell}`);
  }
});

test("deed_of_chattel_mortgage preview renders the vehicle block as a repeated 2-column key/value table, not the old wide-row format", () => {
  // The fixed shape: one <div data-repeat="vehicles"> wrapping a single
  // <table> whose rows are <th>Label</th><td>{{field}}</td> pairs — not a
  // <tr data-repeat="vehicles"> row inside one shared wide table.
  assert.match(PREVIEW, /<div data-repeat="vehicles">/);
  assert.doesNotMatch(PREVIEW, /<tr data-repeat="vehicles">/);

  const blockMatch = PREVIEW.match(/<div data-repeat="vehicles">([\s\S]*?)<\/div>/);
  assert.ok(blockMatch, "expected a data-repeat=\"vehicles\" block");
  const block = blockMatch![1];

  // 7 rows, each a label/value pair, in the source's own field order.
  const expectedRows: [string, string][] = [
    ["Make / Year Model", "{{makeYearModel}}"],
    ["Engine No.", "{{engineNo}}"],
    ["Chassis No.", "{{chassisNo}}"],
    ["Plate No.", "{{plateNo}}"],
    ["CR No.", "{{crNo}}"],
    ["MV File No.", "{{mvFileNo}}"],
    ["Registered Owner", "{{registeredOwner}}"],
  ];
  for (const [label, token] of expectedRows) {
    assert.match(
      block,
      new RegExp(`<tr><th>${label}</th><td>${token.replace(/[{}]/g, "\\$&")}</td></tr>`),
    );
  }
  // Exactly one table inside the repeat block (one small per-vehicle table,
  // not a shared wide table with a header row).
  assert.equal((block.match(/<table>/g) ?? []).length, 1);
  assert.doesNotMatch(block, /<th>Make \/ Year Model<\/th><th>Engine No\.<\/th>/);
});

test("deed_of_chattel_mortgage preview binds the core BLRI/loan merge fields", () => {
  for (const token of [
    "{{borrowerName}}",
    "{{address}}",
    "{{companyName}}",
    "{{lenderRepresentative}}",
    "{{lenderAddress}}",
    "{{principalAndCentavosInWords}}",
    "{{principal}}",
    "{{termsInWords}}",
    "{{interestRateInWords}}",
    "{{totalLoanAndCentavosInWords}}",
    "{{totalLoan}}",
    "{{executionDate}}",
    "{{executionPlace}}",
    "{{notaryDocNo}}",
    "{{notaryPageNo}}",
    "{{notaryBookNo}}",
    "{{notarySeries}}",
  ]) {
    assert.ok(PREVIEW.includes(token), `expected preview to bind ${token}`);
  }
});
