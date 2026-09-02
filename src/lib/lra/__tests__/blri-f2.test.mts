import test from "node:test";
import assert from "node:assert/strict";

import { computeSfLoan } from "../../computation/sf";
import { buildBlriData } from "../blri-data";

function approxEqual(actual: number, expected: number, tolerance = 0.01) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance + 1e-6,
    `expected ${expected} ±${tolerance}, got ${actual}`,
  );
}

test("F2 BLRI data — Del Poso field values match sample", () => {
  const r = computeSfLoan({
    inputMode: "NET_SARADO",
    amount: 90_000,
    terms: 7,
    addonMonths: 2,
    pfRate: 0.1134,
    interestRate: 0.021,
    securityFeeRate: 0.021,
  });

  const blri = buildBlriData({
    applicationNo: "LA-2026-0001",
    borrower: {
      id: "b1",
      borrowerNo: "BR-001",
      userId: null,
      email: "test@example.com",
      firstName: "Del",
      lastName: "Poso",
      middleName: null,
      suffix: null,
      dateOfBirth: null,
      placeOfBirth: null,
      citizenship: null,
      civilStatus: null,
      gender: null,
      mobilePhone: null,
      landline: null,
      presentAddress: {},
      permanentAddress: {},
      manningAgency: {},
      financial: {},
      allottee: {},
      picWork: {},
      businessInfo: {},
      dependents: [],
      references: [],
      profileData: {},
      createdAt: "",
      updatedAt: "",
    },
    computation: {
      id: "c1",
      loanApplicationId: "a1",
      version: 1,
      inputMode: "NET_SARADO",
      inputAmount: 90_000,
      terms: 7,
      addonMonths: 2,
      pfRate: 0.1134,
      interestRate: 0.021,
      securityFeeRate: 0.021,
      loanTypeId: null,
      loanTypeName: "SF",
      otherDeductions: {},
      principal: r.principal,
      processingFee: r.processingFee,
      adminCost: r.adminCost,
      docStamp: r.docStamp,
      notaryFee: r.notaryFee,
      securityFee: r.securityFee,
      otherDeductionsTotal: r.otherDeductionsTotal,
      totalDeductions: r.totalDeductions,
      netReleased: r.netReleased,
      totalInterest: r.totalInterest,
      // Undiscounted computation — gross equals net (see mapComputationRow's
      // fallback for the same reasoning).
      grossTotalInterest: r.totalInterest,
      totalLoan: r.totalLoan,
      monthlyAmortization: r.monthlyAmortization,
      releaseDate: "2026-06-10",
      firstPaymentDate: "2026-08-10",
      dueDay: 10,
      lineItems: [
        { key: "processing_fee", label: "Processing Fee", amount: r.processingFee },
        { key: "admin_cost", label: "Admin Cost", amount: r.adminCost },
        { key: "doc_stamp", label: "Doc Stamp", amount: r.docStamp },
        { key: "security_fee", label: "Security Fee", amount: r.securityFee },
      ],
      coverageRatio: null,
      coverageWarning: false,
      computedBy: null,
      signedAt: null,
      signedBy: null,
      isActive: true,
      createdAt: "",
    },
  });

  approxEqual(blri.principal, 102_605.05);
  approxEqual(blri.totalInterest, 19_392.36);
  approxEqual(blri.totalLoan, 121_997.41);
  approxEqual(blri.monthlyAmortization, 17_428.20);
  assert.equal(blri.terms, 7);
  assert.equal(blri.firstPaymentDate, "08/10/26");

  const admin = blri.particulars.find((p) => p.label === "Admin Cost");
  assert.ok(admin);
  approxEqual(admin!.amount, 3_421.90);

  assert.equal(blri.pdcSchedule.length, 7);
  for (const row of blri.pdcSchedule) {
    approxEqual(row.amount, 17_428.20);
  }
});

test("BLRI fallback PDC schedule clamps to Feb 28 instead of overflowing to March (month-overflow bug fix, 2026-08-30)", () => {
  // releaseDate day 5 (< 22, no cutoff shift) + addonMonths 1 + dueDay 30
  // -> firstPayment = Sep 30, 2026. The 6th installment (index 5) used to
  // overflow to Mar 2, 2027 before this fix.
  const blri = buildBlriData({
    applicationNo: "LA-2026-0002",
    borrower: {
      id: "b2",
      borrowerNo: "BR-002",
      userId: null,
      email: "test2@example.com",
      firstName: "Ana",
      lastName: "Santos",
      middleName: null,
      suffix: null,
      dateOfBirth: null,
      placeOfBirth: null,
      citizenship: null,
      civilStatus: null,
      gender: null,
      mobilePhone: null,
      landline: null,
      presentAddress: {},
      permanentAddress: {},
      manningAgency: {},
      financial: {},
      allottee: {},
      picWork: {},
      businessInfo: {},
      dependents: [],
      references: [],
      profileData: {},
      createdAt: "",
      updatedAt: "",
    },
    computation: {
      id: "c2",
      loanApplicationId: "a2",
      version: 1,
      inputMode: "PRINCIPAL",
      inputAmount: 110_000,
      terms: 6,
      addonMonths: 1,
      pfRate: 0.1,
      interestRate: 0.03,
      securityFeeRate: 0,
      loanTypeId: null,
      loanTypeName: "SME",
      otherDeductions: {},
      principal: 110_000,
      processingFee: 0,
      adminCost: 0,
      docStamp: 0,
      notaryFee: 0,
      securityFee: 0,
      otherDeductionsTotal: 0,
      totalDeductions: 0,
      netReleased: 110_000,
      totalInterest: 19_800,
      grossTotalInterest: 19_800,
      totalLoan: 129_800,
      monthlyAmortization: 21_633.33,
      releaseDate: "2026-08-05",
      firstPaymentDate: "2026-09-30",
      dueDay: 30,
      originationDiscounts: null,
      lineItems: [],
      coverageRatio: null,
      coverageWarning: false,
      adminRate: null,
      chattelRate: null,
      chattelFee: null,
      withDsAndNotary: null,
      paymentFrequency: "monthly",
      computedBy: null,
      signedAt: null,
      signedBy: null,
      witnessedBy: null,
      isActive: true,
      createdAt: "",
    },
  });

  assert.equal(blri.pdcSchedule.length, 6);
  assert.equal(blri.pdcSchedule[0].checkDate, "09/30/26");
  assert.equal(blri.pdcSchedule[1].checkDate, "10/30/26");
  assert.equal(blri.pdcSchedule[2].checkDate, "11/30/26");
  assert.equal(blri.pdcSchedule[3].checkDate, "12/30/26");
  assert.equal(blri.pdcSchedule[4].checkDate, "01/30/27");
  assert.equal(blri.pdcSchedule[5].checkDate, "02/28/27"); // not 03/02/27
});
