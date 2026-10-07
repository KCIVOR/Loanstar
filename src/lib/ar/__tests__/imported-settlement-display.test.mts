import assert from "node:assert/strict";
import test from "node:test";
import { isImportedSettlementSnapshot } from "../masterlist-display";

test("settled legacy snapshots must not invent an original-loan-debit ledger without historical credits", () => {
  assert.equal(isImportedSettlementSnapshot({ is_legacy_import: true, account_status: "paid", amortization_schedules: [] }), true);
  for (const row of [
    { is_legacy_import: false, account_status: "paid", amortization_schedules: [] },
    { is_legacy_import: true, account_status: "active", amortization_schedules: [] },
    { is_legacy_import: true, account_status: "paid", amortization_schedules: [{ id: "real-schedule" }] },
  ]) assert.equal(isImportedSettlementSnapshot(row), false);
});
