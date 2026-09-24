import assert from "node:assert/strict";
import test from "node:test";

import { SOURCE_FAITHFUL_VOLUNTARY_SURRENDER_DEED_AUTO_PREVIEW as PREVIEW } from "../voluntary-surrender-deed-auto-preview";

test("voluntary_surrender_deed_auto preview is schema-safe: no <style>, no CSS Grid, no unsupported inline style=", () => {
  assert.doesNotMatch(PREVIEW, /<style/i);
  assert.doesNotMatch(PREVIEW, /display:\s*grid/i);
  const otherStyles = PREVIEW.match(/ style="([^"]*)"/g) ?? [];
  for (const style of otherStyles) {
    assert.match(style, /text-align:\s*(center|right)/);
  }
});

test("voluntary_surrender_deed_auto preview has no nested <p> inside a table cell", () => {
  const cellContents = PREVIEW.match(/<td[^>]*>([\s\S]*?)<\/td>/g) ?? [];
  for (const cell of cellContents) {
    assert.doesNotMatch(cell, /<p[ >]/, `table cell content must be inline-only: ${cell}`);
  }
});

test("voluntary_surrender_deed_auto preview renders BOTH vehicle blocks (VEHICLE INFO + Deed of Absolute Sale) as repeated 2-column key/value tables, not the old wide-row format", () => {
  const repeatBlocks = PREVIEW.match(/<div data-repeat="vehicles">[\s\S]*?<\/div>/g) ?? [];
  assert.equal(repeatBlocks.length, 2, "expected 2 data-repeat=\"vehicles\" blocks (VEHICLE INFO + Deed of Absolute Sale)");
  assert.doesNotMatch(PREVIEW, /<tr data-repeat="vehicles">/);

  // Block 1 — VEHICLE INFO (7 rows, incl. Registered Owner).
  const infoBlock = repeatBlocks[0];
  for (const [label, token] of [
    ["Make / Year Model", "{{makeYearModel}}"],
    ["Engine No.", "{{engineNo}}"],
    ["Chassis No.", "{{chassisNo}}"],
    ["Plate No.", "{{plateNo}}"],
    ["CR No.", "{{crNo}}"],
    ["MV File No.", "{{mvFileNo}}"],
    ["Registered Owner", "{{registeredOwner}}"],
  ] as [string, string][]) {
    assert.match(
      infoBlock,
      new RegExp(`<tr><th>${label}</th><td>${token.replace(/[{}]/g, "\\$&")}</td></tr>`),
    );
  }
  assert.equal((infoBlock.match(/<table>/g) ?? []).length, 1);

  // Block 2 — Deed of Absolute Sale vehicle description (6 rows, no
  // Registered Owner — matches this document's own source).
  const deedBlock = repeatBlocks[1];
  for (const [label, token] of [
    ["Make / Year Model", "{{makeYearModel}}"],
    ["Engine No.", "{{engineNo}}"],
    ["Chassis No.", "{{chassisNo}}"],
    ["Plate No.", "{{plateNo}}"],
    ["CR No.", "{{crNo}}"],
    ["MV File No.", "{{mvFileNo}}"],
  ] as [string, string][]) {
    assert.match(
      deedBlock,
      new RegExp(`<tr><th>${label}</th><td>${token.replace(/[{}]/g, "\\$&")}</td></tr>`),
    );
  }
  assert.doesNotMatch(deedBlock, /Registered Owner/);
  assert.equal((deedBlock.match(/<table>/g) ?? []).length, 1);

  assert.doesNotMatch(PREVIEW, /<th>Make \/ Year Model<\/th><th>Engine No\.<\/th>/);
});

test("voluntary_surrender_deed_auto preview keeps both Annex sections and the page break between them", () => {
  assert.match(PREVIEW, /ANNEX &ldquo;C&rdquo;/);
  assert.match(PREVIEW, /ANNEX &ldquo;D&rdquo;/);
  assert.match(PREVIEW, /<hr\/>/);
  assert.match(PREVIEW, /VOLUNTARY SURRENDER FORM/);
  assert.match(PREVIEW, /DEED OF ABSOLUTE SALE/);
});

test("voluntary_surrender_deed_auto preview binds the core surrender/sale merge fields", () => {
  for (const token of [
    "{{borrowerName}}",
    "{{address}}",
    "{{companyName}}",
    "{{surrenderDebtAmountInWords}}",
    "{{surrenderDebtAmount}}",
    "{{redemptionPeriod}}",
    "{{witnessOne}}",
    "{{witnessTwo}}",
    "{{executionDate}}",
    "{{executionPlace}}",
    "{{lenderAddress}}",
    "{{borrowerTin}}",
    "{{lenderTin}}",
    "{{notaryDocNo}}",
  ]) {
    assert.ok(PREVIEW.includes(token), `expected preview to bind ${token}`);
  }
});
