import assert from "node:assert/strict";
import test from "node:test";

import { SOURCE_FAITHFUL_CANCELLATION_OF_CHATTEL_MORTGAGE_PREVIEW as PREVIEW } from "../cancellation-of-chattel-mortgage-preview";

test("cancellation_of_chattel_mortgage preview is schema-safe: no <style>, no CSS Grid, no unsupported inline style=", () => {
  assert.doesNotMatch(PREVIEW, /<style/i);
  assert.doesNotMatch(PREVIEW, /display:\s*grid/i);
  const otherStyles = PREVIEW.match(/ style="([^"]*)"/g) ?? [];
  for (const style of otherStyles) {
    assert.match(style, /text-align:\s*center/);
  }
});

test("cancellation_of_chattel_mortgage preview has no nested <p> inside a table cell", () => {
  const cellContents = PREVIEW.match(/<td[^>]*>([\s\S]*?)<\/td>/g) ?? [];
  for (const cell of cellContents) {
    assert.doesNotMatch(cell, /<p[ >]/, `table cell content must be inline-only: ${cell}`);
  }
});

test("cancellation_of_chattel_mortgage preview renders the vehicle block as a repeated 2-column key/value table, not the old wide-row format", () => {
  assert.match(PREVIEW, /<div data-repeat="vehicles">/);
  assert.doesNotMatch(PREVIEW, /<tr data-repeat="vehicles">/);

  const blockMatch = PREVIEW.match(/<div data-repeat="vehicles">([\s\S]*?)<\/div>/);
  assert.ok(blockMatch, "expected a data-repeat=\"vehicles\" block");
  const block = blockMatch![1];

  // 6 rows (no Registered Owner — this document's own source omits it), in
  // the source's own field order: Year Model/Make, Plate, Engine, CR,
  // Chassis, MV File.
  const expectedRows: [string, string][] = [
    ["Year Model / Make", "{{makeYearModel}}"],
    ["Plate No.", "{{plateNo}}"],
    ["Engine No.", "{{engineNo}}"],
    ["CR No.", "{{crNo}}"],
    ["Chassis No.", "{{chassisNo}}"],
    ["MV File No.", "{{mvFileNo}}"],
  ];
  for (const [label, token] of expectedRows) {
    assert.match(
      block,
      new RegExp(`<tr><th>${label}</th><td>${token.replace(/[{}]/g, "\\$&")}</td></tr>`),
    );
  }
  assert.doesNotMatch(block, /Registered Owner/);
  assert.equal((block.match(/<table>/g) ?? []).length, 1);
  assert.doesNotMatch(block, /<th>Year Model \/ Make<\/th><th>Plate No\.<\/th>/);
});

test("cancellation_of_chattel_mortgage preview keeps the isCorpOrDti recipient conditional intact around the fixed vehicle block", () => {
  assert.match(PREVIEW, /<p data-unless="isCorpOrDti">/);
  assert.match(PREVIEW, /<p data-if="isCorpOrDti">/);
  assert.match(PREVIEW, /\{\{borrowerRepresentativeTitle\}\}/);
});

test("cancellation_of_chattel_mortgage preview binds the core mortgage-cancellation merge fields", () => {
  for (const token of [
    "{{borrowerName}}",
    "{{address}}",
    "{{companyName}}",
    "{{lenderAddress}}",
    "{{priorMortgageAmount}}",
    "{{priorMortgageAmountInWords}}",
    "{{priorMortgageExecutedOn}}",
    "{{priorMortgageDocNo}}",
    "{{priorMortgageRegistryOfDeeds}}",
    "{{authorizedSignatory}}",
    "{{executionDate}}",
    "{{executionPlace}}",
    "{{notaryDocNo}}",
  ]) {
    assert.ok(PREVIEW.includes(token), `expected preview to bind ${token}`);
  }
});
