import assert from "node:assert/strict";
import test from "node:test";

import { parseLegacyFile } from "../parse-file";

test("sends Excel files to the protected server parser and exposes its sheets", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = (async (input, init) => {
    assert.equal(input, "/api/admin/legacy-import/parse");
    assert.equal(init?.method, "POST");
    assert.equal(init?.body instanceof FormData, true);
    assert.equal((init?.body as FormData).get("file") instanceof File, true);
    return Response.json({
      sheetNames: ["Accounts"],
      sheets: { Accounts: [["Legacy Loan No."], ["LN-001"]] },
    });
  }) as typeof fetch;

  const workbook = await parseLegacyFile(
    new File(["not read by the browser"], "legacy-masterlist-import-individual.xlsx"),
  );

  assert.deepEqual(workbook.sheetNames, ["Accounts"]);
  assert.deepEqual(workbook.readSheet("Accounts"), [["Legacy Loan No."], ["LN-001"]]);
});

test("keeps CSV parsing inside the browser", async () => {
  const workbook = await parseLegacyFile(new File(["Loan No.\nLN-001\n"], "legacy.csv"));

  assert.deepEqual(workbook.sheetNames, ["CSV"]);
  assert.deepEqual(workbook.readSheet("CSV"), [["Loan No."], ["LN-001"]]);
});
