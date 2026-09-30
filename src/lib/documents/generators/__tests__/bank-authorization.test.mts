import test from "node:test";
import assert from "node:assert/strict";

import { buildBankAuthorizationContext } from "../bank-authorization";

test("CSA bank authorization: borrower name, print date, application-form bank accounts", () => {
  const ctx = buildBankAuthorizationContext(
    {
      firstName: "Carlos",
      lastName: "Bautista",
      businessInfo: {
        bankAccounts: [{ bankName: "BDO", branch: "Makati Ave", accountType: "Savings", accountNo: "123" }],
      },
    } as never,
    new Date("2026-10-01T03:00:00Z"),
  );
  assert.equal(ctx.borrowerName, "Carlos Bautista");
  assert.equal(ctx.dateReleasedLong, "October 1, 2026");
  assert.deepEqual(ctx.bankAuthorizationAccounts, [
    { bankNameAndBranch: "BDO - Makati Ave", accountType: "Savings", accountNo: "123" },
  ]);
});
