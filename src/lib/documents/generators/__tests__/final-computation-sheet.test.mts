import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDeductionRows,
  buildFinalComputationRows,
  type ComputationFigures,
} from "../final-computation-sheet";

const ORIGINAL: ComputationFigures = {
  principal: 102605.05,
  totalInterest: 19392.36,
  totalLoan: 121997.41,
  monthlyAmortization: 17428.2,
  netReleased: 90000,
  terms: 7,
  interestRate: 0.021,
};

const RENEGOTIATED: ComputationFigures = {
  principal: 110000,
  totalInterest: 23100,
  totalLoan: 133100,
  monthlyAmortization: 13310,
  netReleased: 95000,
  terms: 10,
  interestRate: 0.021,
};

test("pairs original vs renegotiated with formatted figures", () => {
  const rows = buildFinalComputationRows(ORIGINAL, RENEGOTIATED);
  const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));

  assert.equal(byLabel.Principal!.original, "102,605.05");
  assert.equal(byLabel.Principal!.renegotiated, "110,000.00");
  assert.equal(byLabel["Terms (months)"]!.original, "7");
  assert.equal(byLabel["Terms (months)"]!.renegotiated, "10");
  assert.equal(byLabel["Interest Rate"]!.original, "2.10%");
});

test("renegotiated column is blank when there was no renegotiation", () => {
  const rows = buildFinalComputationRows(ORIGINAL, null);
  assert.ok(rows.every((r) => r.renegotiated === ""));
  assert.equal(rows.find((r) => r.label === "Net Released")!.original, "90,000.00");
});

test("covers the full figure set in a stable order", () => {
  const rows = buildFinalComputationRows(ORIGINAL, RENEGOTIATED);
  assert.deepEqual(
    rows.map((r) => r.label),
    [
      "Principal",
      "Total Interest",
      "Total Loan",
      "Monthly Amortization",
      "Net Released",
      "Terms (months)",
      "Interest Rate",
    ],
  );
});

test("buildDeductionRows: one row per deduction entry, no renegotiation", () => {
  const rows = buildDeductionRows(
    {
      otherLoans: [
        { accountNo: "AN1", amount: 5_000 },
        { accountNo: "AN2", amount: 3_000 },
      ],
    },
    undefined,
    false,
  );
  assert.deepEqual(rows, [
    { label: "Offset (AN1)", original: "5,000.00", renegotiated: "" },
    { label: "Offset (AN2)", original: "3,000.00", renegotiated: "" },
  ]);
});

test("buildDeductionRows: no deductions produces no rows", () => {
  assert.deepEqual(buildDeductionRows(null, null, false), []);
});

test("buildDeductionRows: pairs by label across original/renegotiated, blank when absent in one side", () => {
  const rows = buildDeductionRows(
    { otherLoans: [{ accountNo: "AN1", amount: 5_000 }] },
    { otherLoans: [{ accountNo: "AN1", amount: 5_000 }], offsets: [{ accountNo: "AN2", amount: 2_000, months: 1 }] },
    true,
  );
  const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
  assert.equal(byLabel["Offset (AN1)"]!.original, "5,000.00");
  assert.equal(byLabel["Offset (AN1)"]!.renegotiated, "5,000.00");
  assert.equal(byLabel["Other Loan (AN2 · 1 mo)"]!.original, "0.00");
  assert.equal(byLabel["Other Loan (AN2 · 1 mo)"]!.renegotiated, "2,000.00");
});
