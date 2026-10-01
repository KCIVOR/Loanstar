import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "..");

function ledgerSource() {
  const path = join(src, "components", "ledger", "AccountLedger.tsx");
  assert.ok(existsSync(path), `Expected ${path} to exist`);
  return readFileSync(path, "utf8");
}

describe("Move of Payment ledger picker", () => {
  it("keeps an eligible partial installment selectable after it has payment history", () => {
    const ledger = ledgerSource();

    // Eligibility comes from the server's open-installment candidate list,
    // not from whether the ledger happens to render the row as a bare
    // installment, a payment, or a collapsed payment group.
    assert.match(ledger, /function isEligibleMoveOfPaymentRow/);
    assert.doesNotMatch(ledger, /row\.kind === "installment"\s*&&\s*row\.dueDate/);
    assert.match(ledger, /const groupEligible = isEligibleMoveOfPaymentRow\(first, selection\)/);
assert.match(ledger, /groupEligible\s*\?\s*\(\)\s*=>\s*selection!\.onSelect\(first\.dueDate!\)/);
  });
});
