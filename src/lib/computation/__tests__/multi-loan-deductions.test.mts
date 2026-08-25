import test from "node:test";
import assert from "node:assert/strict";

import { computeSfLoan } from "../sf";
import { computeSmeLoan } from "../sme";

function approxEqual(actual: number, expected: number, tolerance = 0.01) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance + 1e-6,
    `expected ${expected} ±${tolerance}, got ${actual}`,
  );
}

const SF_BASE = {
  inputMode: "NET_SARADO" as const,
  amount: 70_000,
  terms: 6,
  addonMonths: 2,
  pfRate: 0.1134,
  interestRate: 0.021,
  securityFeeRate: 0.021,
};

const SME_BASE = {
  loanDesired: 100_000,
  terms: 6,
  addonMonths: 0,
  pfRate: 0.05,
  interestRate: 0.02,
  adminRate: 0.01,
};

test("sf: legacy singular otherLoan/offset still total the same as before (backward compat)", () => {
  const legacy = computeSfLoan({
    ...SF_BASE,
    otherDeductions: { otherLoan: 5_000, offset: 3_000 },
  });
  approxEqual(legacy.otherDeductionsTotal, 8_000);
});

test("sf: otherLoans array sums multiple entries", () => {
  const r = computeSfLoan({
    ...SF_BASE,
    otherDeductions: {
      otherLoans: [
        { accountNo: "AN1", amount: 5_000 },
        { accountNo: "AN2", amount: 3_000 },
      ],
    },
  });
  approxEqual(r.otherDeductionsTotal, 8_000);
});

test("sf: offsets array sums multiple entries", () => {
  const r = computeSfLoan({
    ...SF_BASE,
    otherDeductions: {
      offsets: [
        { accountNo: "AN1", amount: 4_250.4, months: 1 },
        { accountNo: "AN2", amount: 8_500.8, months: 2 },
      ],
    },
  });
  approxEqual(r.otherDeductionsTotal, 12_751.2);
});

test("sf: array wins over legacy scalar — never double-counted", () => {
  const r = computeSfLoan({
    ...SF_BASE,
    otherDeductions: {
      // Legacy scalar present alongside the array — array must win.
      otherLoan: 999_999,
      otherLoans: [{ accountNo: "AN1", amount: 5_000 }],
      offset: 999_999,
      offsets: [{ accountNo: "AN2", amount: 3_000, months: 1 }],
    },
  });
  approxEqual(r.otherDeductionsTotal, 8_000);
});

test("sf: empty arrays fall back to legacy scalar default (0)", () => {
  const r = computeSfLoan({
    ...SF_BASE,
    otherDeductions: { otherLoans: [], offsets: [] },
  });
  approxEqual(r.otherDeductionsTotal, 0);
});

test("sme: legacy singular otherLoan/offset still total the same as before (backward compat)", () => {
  const legacy = computeSmeLoan({
    ...SME_BASE,
    otherDeductions: { otherLoan: 5_000, offset: 3_000 },
  });
  approxEqual(legacy.otherDeductionsTotal, 8_000);
});

test("sme: otherLoans + offsets arrays sum multiple entries, array wins over legacy scalar", () => {
  const r = computeSmeLoan({
    ...SME_BASE,
    otherDeductions: {
      otherLoan: 999_999,
      otherLoans: [
        { accountNo: "AN1", amount: 5_000 },
        { accountNo: "AN2", amount: 3_000 },
      ],
      offset: 999_999,
      offsets: [{ accountNo: "AN3", amount: 2_000, months: 1 }],
    },
  });
  approxEqual(r.otherDeductionsTotal, 10_000);
});
