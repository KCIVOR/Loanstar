import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseCsv } from "../csv";
import { fieldsForSegment, type ColumnMapping } from "../fields";
import { applyOverrides, flaggedColumns, mergeResults, templateCsv } from "../fixes";
import { suggestMapping } from "../suggest";
import type { RowResult } from "../validate";

const result = (rowNumber: number, over: Partial<RowResult> = {}): RowResult => ({
  rowNumber,
  status: "valid",
  legacyBorrowerNo: null,
  legacyLoanNo: null,
  name: null,
  errors: [],
  warnings: [],
  ...over,
});

describe("applyOverrides", () => {
  it("replaces only the overridden cells of the matching row", () => {
    const row = { rowNumber: 5, cells: ["a", 10, null] };
    const out = applyOverrides(row, { 5: { 1: "20" } });
    assert.deepEqual(out.cells, ["a", "20", null]);
    assert.deepEqual(row.cells, ["a", 10, null], "input not mutated");
  });

  it("blank overrides become null and short rows are padded", () => {
    const out = applyOverrides({ rowNumber: 2, cells: ["x"] }, { 2: { 0: "  ", 3: "y" } });
    assert.deepEqual(out.cells, [null, null, null, "y"]);
  });

  it("leaves other rows untouched", () => {
    const row = { rowNumber: 3, cells: ["a"] };
    assert.equal(applyOverrides(row, { 4: { 0: "b" } }), row);
  });
});

describe("flaggedColumns", () => {
  it("returns mapped columns whose label appears in the row issues", () => {
    const mapping: ColumnMapping[] = [
      { index: 0, header: "Terms", target: "terms" },
      { index: 1, header: "Email", target: "email" },
      { index: 2, header: "x", target: null },
    ];
    const r = result(2, { errors: ["Terms: not a number"], warnings: [] });
    assert.deepEqual([...flaggedColumns(r, mapping)], [0]);
  });
});

describe("mergeResults", () => {
  it("swaps updated rows by row number, keeps order", () => {
    const base = [result(2, { status: "error" }), result(3)];
    const merged = mergeResults(base, [result(2)]);
    assert.deepEqual(merged.map((r) => [r.rowNumber, r.status]), [[2, "valid"], [3, "valid"]]);
  });
});

describe("templateCsv", () => {
  it("header row round-trips through auto-suggest to every field", () => {
    for (const segment of ["seafarer", "sme"] as const) {
      const [headers] = parseCsv(templateCsv(segment));
      const fields = fieldsForSegment(segment);
      assert.equal(headers.length, fields.length);
      const mapping = suggestMapping(headers, segment);
      assert.deepEqual(mapping.map((m) => m.target), fields.map((f) => f.key), segment);
    }
  });
});
