import test from "node:test";
import assert from "node:assert/strict";

import type { BorrowerProfile } from "../../borrowers/types";
import type { BlriData } from "../blri-data";
import {
  buildReleaseTemplateContext,
  pesosInWords,
} from "../template-context";

test("pesosInWords spells whole-peso amounts", () => {
  assert.equal(pesosInWords(90000), "Ninety Thousand Pesos");
  assert.equal(pesosInWords(0), "Zero Pesos");
  assert.equal(pesosInWords(1_000_000), "One Million Pesos");
  assert.equal(
    pesosInWords(102605.05),
    "One Hundred Two Thousand Six Hundred Five Pesos",
  );
});

const BLRI: BlriData = {
  loanAccountNo: "LA303342",
  borrowerName: "Jonathan Del Poso",
  principal: 102605.05,
  totalInterest: 19392.36,
  totalLoan: 121997.41,
  monthlyAmortization: 17428.2,
  terms: 7,
  firstPaymentDate: "08/10/26",
  particulars: [
    { label: "Processing Fee", amount: 6156.3, accountCode: "5003010" },
    { label: "Security Fee", amount: 2154.71, accountCode: "2100002" },
  ],
  pdcSchedule: [
    { checkNumber: "102901", checkDate: "08/10/26", amount: 17428.2, bankName: "CHINABANK" },
  ],
};

const BORROWER = {
  borrowerNo: "BN302754",
  presentAddress: { street: "544 J. Buizon St", city: "Baliwag", province: "Bulacan" },
  manningAgency: { name: "Marlow Navigation Philippines Inc." },
  picWork: { vessel: "Marlow Navigation Co. Ltd" },
  financial: { bankName: "EW-2858", accountNumber: "200026352858" },
} as unknown as BorrowerProfile;

const COMPUTATION = { netReleased: 90000, releaseDate: "2026-06-11" };

test("with_pdc context disburses via Bank (check)", () => {
  const ctx = buildReleaseTemplateContext(BLRI, COMPUTATION, BORROWER, "with_pdc");
  assert.equal(ctx.isCheck, true);
  assert.equal(ctx.isCash, false);
  assert.equal(ctx.borrowerName, "Jonathan Del Poso");
  assert.equal(ctx.netLoanAmount, "90,000.00");
  assert.equal(ctx.amountInWords, "Ninety Thousand Pesos");
  const entries = ctx.accountingEntries as Array<{ accountCode: string; credit: string }>;
  const bankLine = entries.find((e) => e.accountCode === "1100115");
  assert.ok(bankLine, "expected a Bank (1100115) credit line");
  assert.equal(bankLine?.credit, "90,000.00");
});

test("without_pdc context disburses via CASH", () => {
  const ctx = buildReleaseTemplateContext(BLRI, COMPUTATION, BORROWER, "without_pdc");
  assert.equal(ctx.isCash, true);
  const entries = ctx.accountingEntries as Array<{ accountCode: string }>;
  assert.ok(entries.find((e) => e.accountCode === "1100110"), "expected CASH (1100110)");
  assert.ok(!entries.find((e) => e.accountCode === "1100115"), "no Bank line for cash");
});

test("particulars and money fields are formatted", () => {
  const ctx = buildReleaseTemplateContext(BLRI, COMPUTATION, BORROWER, "with_pdc");
  const particulars = ctx.particulars as Array<{ label: string; amount: string }>;
  assert.equal(particulars[0].amount, "6,156.30");
  assert.equal(ctx.principal, "102,605.05");
  assert.equal(ctx.manningAgency, "Marlow Navigation Philippines Inc.");
  assert.equal(ctx.address, "544 J. Buizon St, Baliwag, Bulacan");
});
