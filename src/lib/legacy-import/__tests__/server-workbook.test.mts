import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { canValidate } from "../fields";
import { parseLegacyWorkbook } from "../server-workbook";
import { suggestMapping } from "../suggest";
import { validateRow } from "../validate";
import { buildActiveImport } from "../active-import";

for (const segment of ["seafarer", "sme", "individual"] as const) {
  test(`new ${segment} dummy contains partial, paid and unpaid accounts that reconcile`, async () => {
    const file = `legacy-masterlist-dummy-${segment}.xlsx`;
    const bytes = await readFile(join(process.cwd(), "outputs", "legacy-import-dummy-data-20261007", file));
    const wb = await parseLegacyWorkbook(file, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const mapping = suggestMapping(wb.sheets.Accounts[0], segment);
    const result = buildActiveImport(wb.sheets.Accounts.slice(1).map((cells, i) => ({ rowNumber: i+2, cells })), mapping, segment, wb.sheets.Installments, "2026-10-07");
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.accounts.map(a => a.values.outstanding_balance), [86500, 0, 120000]);
    assert.deepEqual(result.accounts.map(a => a.values.account_status), ["active", "paid", "active"]);
    assert.deepEqual(result.accounts.map(a => a.installments.length), [9, 0, 12]);
    assert.equal(new Set(result.accounts.map(a => a.values.email)).size, 3);
  });
}

test("reads every sheet in the downloadable Individual workbook on the server", async () => {
  const path = join(
    process.cwd(),
    "public",
    "legacy-import-templates",
    "legacy-masterlist-import-individual.xlsx",
  );
  const bytes = await readFile(path);
  const workbook = await parseLegacyWorkbook(
    "legacy-masterlist-import-individual.xlsx",
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );

  assert.deepEqual(workbook.sheetNames, ["Accounts", "Installments", "Payments", "PDC Checks", "Instructions"]);
  assert.equal(workbook.sheets.Accounts[0]?.includes("Individual Loan Type"), true);
});

for (const segment of ["seafarer", "sme", "individual"] as const) {
  test(`${segment} dummy reconciles its opening balance and passes active-import checks`, async () => {
    const name = `legacy-masterlist-dummy-${segment}.xlsx`;
    const bytes = await readFile(join(process.cwd(), "outputs", "legacy-import-dummy-data-20261005", name));
    const workbook = await parseLegacyWorkbook(name, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const result = buildActiveImport([{ rowNumber: 2, cells: workbook.sheets.Accounts[1] }],
      suggestMapping(workbook.sheets.Accounts[0], segment), segment, workbook.sheets.Installments, "2026-10-07");
    assert.deepEqual(result.errors, []);
    assert.equal(result.accounts[0].values.outstanding_balance, 86500);
    assert.equal(result.accounts[0].installments.length, 9);
    assert.equal(result.accounts[0].installments[0].due_date, "2026-04-10");
  });
}

test("reads the supplied dummy workbook that uses SpreadsheetML namespace prefixes", async () => {
  const path = join(
    process.cwd(),
    "outputs",
    "legacy-import-dummy-data-20261005",
    "legacy-masterlist-dummy-seafarer.xlsx",
  );
  const bytes = await readFile(path);
  const workbook = await parseLegacyWorkbook(
    "legacy-masterlist-dummy-seafarer.xlsx",
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );

  assert.deepEqual(workbook.sheetNames, ["Accounts", "Installments", "Payments", "PDC Checks", "Instructions"]);
  assert.equal(workbook.sheets.Accounts[1]?.[0], "TEST-SF-20261005-001");
});

test("ships a seafarer dummy workbook that auto-maps and validates without errors", async () => {
  const path = join(
    process.cwd(),
    "outputs",
    "legacy-import-dummy-data-20261005",
    "legacy-masterlist-dummy-seafarer.xlsx",
  );
  const bytes = await readFile(path);
  const workbook = await parseLegacyWorkbook(
    "legacy-masterlist-dummy-seafarer.xlsx",
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  const headers = workbook.sheets.Accounts[0] ?? [];
  const row = workbook.sheets.Accounts[1] ?? [];
  const mapping = suggestMapping(headers, "seafarer");

  assert.equal(canValidate(mapping, "seafarer"), true);
  const result = validateRow({ rowNumber: 2, cells: row }, mapping, "seafarer");
  assert.deepEqual(result.errors, []);
});
