import assert from "node:assert/strict";
import test from "node:test";

import { SOURCE_FAITHFUL_SPA_MORTGAGE_CANCELLATION_PREVIEW as PREVIEW } from "../spa-mortgage-cancellation-preview";

test("spa_mortgage_cancellation preview is schema-safe: no <style>, no CSS Grid, no unsupported inline style=", () => {
  assert.doesNotMatch(PREVIEW, /<style/i);
  assert.doesNotMatch(PREVIEW, /display:\s*grid/i);
  const otherStyles = PREVIEW.match(/ style="([^"]*)"/g) ?? [];
  for (const style of otherStyles) {
    assert.match(style, /text-align:\s*center/);
  }
});

test("spa_mortgage_cancellation preview has no nested <p> inside a table cell", () => {
  const cellContents = PREVIEW.match(/<td[^>]*>([\s\S]*?)<\/td>/g) ?? [];
  for (const cell of cellContents) {
    assert.doesNotMatch(cell, /<p[ >]/, `table cell content must be inline-only: ${cell}`);
  }
});

test("spa_mortgage_cancellation preview renders the vehicle block as a repeated 2-column key/value table, not the old wide-row format", () => {
  assert.match(PREVIEW, /<div data-repeat="vehicles">/);
  assert.doesNotMatch(PREVIEW, /<tr data-repeat="vehicles">/);
  // The invented `transmission` field (never wired anywhere in
  // buildReleaseTemplateContext / DocumentVehicleRow) must not reappear.
  assert.doesNotMatch(PREVIEW, /\{\{transmission\}\}/);

  const blockMatch = PREVIEW.match(/<div data-repeat="vehicles">([\s\S]*?)<\/div>/);
  assert.ok(blockMatch, "expected a data-repeat=\"vehicles\" block");
  const block = blockMatch![1];

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
  assert.equal((block.match(/<table>/g) ?? []).length, 1);
  assert.doesNotMatch(block, /<th>Make \/ Series \/ Year Model<\/th>/);
});

test("spa_mortgage_cancellation preview binds the core BLRI/loan merge fields", () => {
  for (const token of [
    "{{borrowerName}}",
    "{{address}}",
    "{{companyName}}",
    "{{lenderAddress}}",
    "{{executionDate}}",
    "{{executionPlace}}",
    "{{witnessOne}}",
    "{{witnessTwo}}",
    "{{borrowerTin}}",
    "{{lenderTin}}",
    "{{lenderRepresentative}}",
    "{{lenderRepresentativeTin}}",
    "{{notaryDocNo}}",
    "{{notaryPageNo}}",
    "{{notaryBookNo}}",
    "{{notarySeries}}",
  ]) {
    assert.ok(PREVIEW.includes(token), `expected preview to bind ${token}`);
  }
});
