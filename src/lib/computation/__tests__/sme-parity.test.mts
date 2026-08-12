import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { computeSmeLoan } from "../sme";

/**
 * Same tolerance as SF fixture tests (`sf-fixtures.test.mts`).
 * HALF-UP vs Excel float baselines can cascade ~1–2 centavos on totals;
 * `+ 1e-6` matches the SF helper. Core fields stay within ₱0.02.
 */
const TOLERANCE = 0.01;

function approxEqual(actual: number, expected: number, tolerance = TOLERANCE) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance + 1e-6,
    `expected ${expected} ±${tolerance}, got ${actual} (Δ ${Math.abs(actual - expected)})`,
  );
}

type Fixture = {
  id: string;
  loanDesired: number;
  terms: number;
  interestRate: number;
  pfRate: number;
  adminRate: number;
  withDsAndNotary: boolean;
  principal: number;
  totalInterest: number;
  totalLoan: number;
  monthly: number;
  notary: number;
  docStamp: number;
  processingFee: number;
  adminCost: number;
};

const fixturesPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "sme-parity-fixtures.json",
);
const fixtures = JSON.parse(readFileSync(fixturesPath, "utf8")) as Fixture[];

describe("SME computation — Loan Desired worked example (extraction §4)", () => {
  test("desired 2,040,816.33 @ 10% PF, 3%/mo × 6", () => {
    const r = computeSmeLoan({
      loanDesired: 2_040_816.33,
      terms: 6,
      pfRate: 0.1,
      interestRate: 0.03,
      adminRate: 0,
      withDsAndNotary: true,
    });

    approxEqual(r.pfBundle, 204_081.63);
    approxEqual(r.principal, 2_244_897.96);
    approxEqual(r.totalInterest, 404_081.63);
    approxEqual(r.totalLoan, 2_648_979.59);
    approxEqual(r.monthlyAmortization, 441_496.6);
  });
});

describe("SME parity vs Calculator SME.xlsm Data register (§6.1)", () => {
  test("loads 35 released-loan fixtures", () => {
    assert.equal(fixtures.length, 35);
  });

  for (const f of fixtures) {
    test(`${f.id} — principal / interest / total / monthly`, () => {
      const r = computeSmeLoan({
        loanDesired: f.loanDesired,
        terms: f.terms,
        pfRate: f.pfRate,
        interestRate: f.interestRate,
        adminRate: f.adminRate,
        withDsAndNotary: f.withDsAndNotary,
      });

      // Cascaded HALF-UP vs Excel float: allow ₱0.02 on totals (same order as SF ₱0.01).
      approxEqual(r.principal, f.principal, 0.02);
      approxEqual(r.totalInterest, f.totalInterest, 0.02);
      approxEqual(r.totalLoan, f.totalLoan, 0.02);
      approxEqual(r.monthlyAmortization, f.monthly, 0.02);
    });

    test(`${f.id} — fee lines (admin anomaly LA900039 excluded)`, () => {
      const r = computeSmeLoan({
        loanDesired: f.loanDesired,
        terms: f.terms,
        pfRate: f.pfRate,
        interestRate: f.interestRate,
        adminRate: f.adminRate,
        withDsAndNotary: f.withDsAndNotary,
      });

      approxEqual(r.docStamp, f.docStamp, 0.02);
      approxEqual(r.notaryFee, f.notary, 0.02);
      approxEqual(r.processingFee, f.processingFee, 0.02);

      // LA900039 recorded admin is a one-off override (extraction §6.2) — engine
      // always uses loan_desired × admin_rate; do not assert the anomalous figure.
      if (f.id !== "LA900039") {
        approxEqual(r.adminCost, f.adminCost, 0.02);
      } else {
        approxEqual(r.adminCost, f.loanDesired * f.adminRate, 0.02);
      }
    });
  }
});

describe("SME engine defaults (workbook)", () => {
  test("addon months default 0; security fee unused; prorate DS off", () => {
    const r = computeSmeLoan({
      loanDesired: 100_000,
      terms: 6,
      pfRate: 0.08,
      interestRate: 0.03,
      adminRate: 0.02,
    });
    assert.equal(r.addonMonths, 0);
    assert.equal(r.securityFee, 0);
    assert.equal(r.chattelFee, 0);
    // Full-year DS (not prorated): 0.75% of principal
    approxEqual(r.docStamp, r.principal * 0.0075, 0.02);
  });
});
