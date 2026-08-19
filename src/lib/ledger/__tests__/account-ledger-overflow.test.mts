import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "..");

function source(...parts: string[]) {
  const path = join(src, ...parts);
  assert.ok(existsSync(path), `Expected ${path} to exist`);
  return readFileSync(path, "utf8");
}

describe("AccountLedger overflow containment", () => {
  it("keeps the min-width on the table, not the scroll wrap", () => {
    const ledger = source("components", "ledger", "AccountLedger.tsx");
    const css = source("app", "globals.css");

    assert.match(ledger, /<Table className="is-compact is-ledger">/);
    assert.doesNotMatch(ledger, /min-w-\[1060px\]/);
    assert.match(ledger, /min-w-0 max-w-full/);

    assert.match(
      css,
      /\.table-wrap\.is-ledger\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/s,
    );
    assert.match(
      css,
      /\.table-wrap\.is-ledger table\.tbl\s*\{[^}]*min-width:\s*1060px;/s,
    );
  });

  it("is the shared table on borrower, collector, remedial, and AR pages", () => {
    const consumers = [
      source("components", "borrower", "LoanActivePanel.tsx"),
      source("components", "payments", "RecordPaymentPage.tsx"),
      source("app", "remedial", "accounts", "[id]", "page.tsx"),
      source("app", "ar", "masterlist", "[id]", "page.tsx"),
    ];

    for (const consumer of consumers) {
      assert.match(consumer, /from "@\/components\/ledger\/AccountLedger"/);
      assert.match(consumer, /<AccountLedger /);
    }
  });
});
