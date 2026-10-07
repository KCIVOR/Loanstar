import assert from "node:assert/strict";
import test from "node:test";

import { buildTemplateWorkbook } from "../template-workbook";
import { canValidate } from "../fields";
import { suggestMapping } from "../suggest";

test("builds an Individual template without an SME Entity Type column", () => {
  const workbook = buildTemplateWorkbook("individual");
  const row = workbook.getWorksheet("Accounts")!.getRow(1);
  const headers = Array.from({ length: row.cellCount }, (_, i) => String(row.getCell(i + 1).value));

  assert.equal(headers.includes("Individual Loan Type"), true);
  assert.equal(headers.includes("Entity Type"), false);
});
test("templates explain paid account zero balance and closing date requirements", () => {
  const instructions = buildTemplateWorkbook("seafarer").getWorksheet("Instructions")!.getRow(6).getCell(1).text;
  assert.match(instructions, /active or paid/);
  assert.match(instructions, /zero balance/);
  assert.match(instructions, /Closed At/);
});

for (const segment of ["seafarer", "sme", "individual"] as const) {
  test(`${segment} template maps every required account column automatically`, () => {
    const row = buildTemplateWorkbook(segment).getWorksheet("Accounts")!.getRow(1);
    const headers = Array.from({ length: row.cellCount }, (_, i) => String(row.getCell(i + 1).value));
    assert.equal(canValidate(suggestMapping(headers, segment), segment), true);
  });
}
