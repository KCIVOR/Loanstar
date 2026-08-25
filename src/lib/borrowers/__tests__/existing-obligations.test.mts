import assert from "node:assert/strict";
import test from "node:test";
import { sumActiveObligations } from "../existing-obligations";

test("sums other active accounts and skips the current application", () => {
  const result = sumActiveObligations(
    [
      {
        loanApplicationId: "a",
        accountStatus: "active",
        monthlyAmortization: 5000,
        outstanding: 80000,
      },
      {
        loanApplicationId: "b",
        accountStatus: "active",
        monthlyAmortization: 3000,
        outstanding: 40000,
      },
      {
        loanApplicationId: "c",
        accountStatus: "paid",
        monthlyAmortization: 2000,
        outstanding: 0,
      },
    ],
    "b",
  );
  assert.equal(result.otherMonthlyAmortization, 5000);
  assert.equal(result.otherOutstanding, 80000);
  assert.equal(result.otherActiveCount, 1);
});

test("returns zeros when all rows are for the excluded application", () => {
  const result = sumActiveObligations(
    [{ loanApplicationId: "a", accountStatus: "active", monthlyAmortization: 5000, outstanding: 80000 }],
    "a",
  );
  assert.equal(result.otherMonthlyAmortization, 0);
  assert.equal(result.otherOutstanding, 0);
  assert.equal(result.otherActiveCount, 0);
});

test("skips non-active account statuses", () => {
  const result = sumActiveObligations(
    [
      { loanApplicationId: "x", accountStatus: "paid", monthlyAmortization: 1000, outstanding: 0 },
      { loanApplicationId: "y", accountStatus: "closed", monthlyAmortization: 2000, outstanding: 5000 },
    ],
    "z",
  );
  assert.equal(result.otherMonthlyAmortization, 0);
  assert.equal(result.otherActiveCount, 0);
});
