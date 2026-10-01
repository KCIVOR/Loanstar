import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const page = readFileSync(
  join(process.cwd(), "src", "app", "ar", "masterlist", "[id]", "page.tsx"),
  "utf8",
);

test("AR ledger summary uses the moved-aware settled-history counter", () => {
  assert.doesNotMatch(page, /billableRolledCount/);
  assert.match(page, /billableSettledHistoryCount/);
});
