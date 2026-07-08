import test from "node:test";
import assert from "node:assert/strict";

import { computeSfLoan } from "../sf";

function approxEqual(actual: number, expected: number, tolerance = 0.01) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance + 1e-6,
    `expected ${expected} ±${tolerance}, got ${actual}`,
  );
}

test("F1 Aludo — NET_SARADO 70,000 t=6 a=2 2.10%/11.34% sec 2.10%", () => {
  const r = computeSfLoan({
    inputMode: "NET_SARADO",
    amount: 70_000,
    terms: 6,
    addonMonths: 2,
    pfRate: 0.1134,
    interestRate: 0.021,
    securityFeeRate: 0.021,
  });

  approxEqual(r.principal, 79_803.92);
  approxEqual(r.processingFee, 4_788.23);
  approxEqual(r.adminCost, 2_661.47);
  approxEqual(r.docStamp, 598.53);
  approxEqual(r.notaryFee, 79.80);
  approxEqual(r.securityFee, 1_675.88);
  approxEqual(r.totalDeductions, 9_803.92);
  approxEqual(r.netReleased, 70_000.0);
  approxEqual(r.totalInterest, 13_407.06);
  approxEqual(r.totalLoan, 93_210.98);
  approxEqual(r.monthlyAmortization, 15_535.16);
});

test("F2 Del Poso — NET_SARADO 90,000 t=7 a=2 2.10%/11.34% sec 2.10%", () => {
  const r = computeSfLoan({
    inputMode: "NET_SARADO",
    amount: 90_000,
    terms: 7,
    addonMonths: 2,
    pfRate: 0.1134,
    interestRate: 0.021,
    securityFeeRate: 0.021,
  });

  approxEqual(r.principal, 102_605.05);
  approxEqual(r.processingFee, 6_156.30);
  approxEqual(r.adminCost, 3_421.90);
  approxEqual(r.docStamp, 769.54);
  approxEqual(r.notaryFee, 102.61);
  approxEqual(r.securityFee, 2_154.71);
  approxEqual(r.netReleased, 90_000.0);
  approxEqual(r.totalInterest, 19_392.36);
  approxEqual(r.totalLoan, 121_997.41);
  approxEqual(r.monthlyAmortization, 17_428.20);
});

test("F3 Archie S1 — NET_LESS_SECURITY 70,000 t=6 a=2 2.75%/11.34% sec 2.75%", () => {
  const r = computeSfLoan({
    inputMode: "NET_LESS_SECURITY",
    amount: 70_000,
    terms: 6,
    addonMonths: 2,
    pfRate: 0.1134,
    interestRate: 0.0275,
    securityFeeRate: 0.0275,
  });

  approxEqual(r.principal, 77_938.0);
  approxEqual(r.processingFee, 4_676.28);
  approxEqual(r.adminCost, 2_599.25);
  approxEqual(r.docStamp, 584.54);
  approxEqual(r.notaryFee, 77.94);
  approxEqual(r.securityFee, 2_143.30);
  approxEqual(r.totalDeductions, 10_081.30);
  approxEqual(r.netReleased, 67_856.70);
  approxEqual(r.totalInterest, 17_146.36);
  approxEqual(r.totalLoan, 95_084.36);
  approxEqual(r.monthlyAmortization, 15_847.39);
});

test("F4 Archie S2 — PRINCIPAL 70,000 t=6 a=2 2.75%/11.34% sec 2.75%", () => {
  const r = computeSfLoan({
    inputMode: "PRINCIPAL",
    amount: 70_000,
    terms: 6,
    addonMonths: 2,
    pfRate: 0.1134,
    interestRate: 0.0275,
    securityFeeRate: 0.0275,
  });

  approxEqual(r.principal, 70_000.0);
  approxEqual(r.processingFee, 4_200.0);
  approxEqual(r.adminCost, 2_334.51);
  approxEqual(r.docStamp, 525.0);
  approxEqual(r.notaryFee, 70.0);
  approxEqual(r.securityFee, 1_925.0);
  approxEqual(r.totalDeductions, 9_054.51);
  approxEqual(r.netReleased, 60_945.49);
  approxEqual(r.totalInterest, 15_400.0);
  approxEqual(r.totalLoan, 85_400.0);
  approxEqual(r.monthlyAmortization, 14_233.33);
});

test("F5 Archie S3 — NET_SARADO 70,000 t=6 a=2 2.75%/11.34% sec 2.75%", () => {
  const r = computeSfLoan({
    inputMode: "NET_SARADO",
    amount: 70_000,
    terms: 6,
    addonMonths: 2,
    pfRate: 0.1134,
    interestRate: 0.0275,
    securityFeeRate: 0.0275,
  });

  approxEqual(r.principal, 80_399.72);
  approxEqual(r.processingFee, 4_823.99);
  approxEqual(r.adminCost, 2_681.35);
  approxEqual(r.docStamp, 603.00);
  approxEqual(r.notaryFee, 80.40);
  approxEqual(r.securityFee, 2_210.99);
  approxEqual(r.totalDeductions, 10_399.72);
  approxEqual(r.netReleased, 70_000.0);
  approxEqual(r.totalInterest, 17_687.94);
  approxEqual(r.totalLoan, 98_087.65);
  approxEqual(r.monthlyAmortization, 16_347.94);
});

test("F6 LMA sample — NET_LESS_SECURITY 100,000 t=6 a=2 2.75%/11.34% security waived", () => {
  const r = computeSfLoan({
    inputMode: "NET_LESS_SECURITY",
    amount: 100_000,
    terms: 6,
    addonMonths: 2,
    pfRate: 0.1134,
    interestRate: 0.0275,
    securityFeeRate: 0,
  });

  approxEqual(r.principal, 111_340.0);
  approxEqual(r.processingFee, 6_680.40);
  approxEqual(r.adminCost, 3_713.21);
  approxEqual(r.docStamp, 835.05);
  approxEqual(r.notaryFee, 111.34);
  approxEqual(r.securityFee, 0.0);
  approxEqual(r.totalDeductions, 11_340.0);
  approxEqual(r.netReleased, 100_000.0);
  approxEqual(r.totalInterest, 24_494.80);
  approxEqual(r.totalLoan, 135_834.80);
  approxEqual(r.monthlyAmortization, 22_639.13);
});

test("F7 fee breakdown contrast — pf 11.34% vs 10.00% DIRECT", () => {
  const at1134 = computeSfLoan({
    inputMode: "NET_LESS_SECURITY",
    amount: 120_000,
    terms: 1,
    addonMonths: 1,
    pfRate: 0.1134,
    interestRate: 0.02,
    securityFeeRate: 0,
  });
  approxEqual(at1134.principal, 133_608.0);
  approxEqual(at1134.processingFee, 8_016.48);
  approxEqual(at1134.docStamp, 1_002.06);
  approxEqual(at1134.notaryFee, 133.61);
  approxEqual(at1134.adminCost, 4_455.85);

  const at10 = computeSfLoan({
    inputMode: "NET_LESS_SECURITY",
    amount: 120_000,
    terms: 1,
    addonMonths: 1,
    pfRate: 0.10,
    interestRate: 0.02,
    securityFeeRate: 0,
  });
  approxEqual(at10.principal, 132_000.0);
  approxEqual(at10.processingFee, 7_920.0);
  approxEqual(at10.docStamp, 990.0);
  approxEqual(at10.notaryFee, 132.0);
  approxEqual(at10.adminCost, 2_958.0);
});

