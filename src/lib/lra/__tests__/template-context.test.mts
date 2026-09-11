import test from "node:test";
import assert from "node:assert/strict";

import type { BorrowerProfile } from "../../borrowers/types";
import type { BlriData } from "../blri-data";
import {
  buildReleaseTemplateContext,
  countInWords,
  pctInWords,
  pesosAndCentavosInWords,
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

test("pesosAndCentavosInWords adds a Cents clause only when non-zero", () => {
  assert.equal(
    pesosAndCentavosInWords(115178.57),
    "One Hundred Fifteen Thousand One Hundred Seventy Eight Pesos & Fifty Seven Cents",
  );
  assert.equal(pesosAndCentavosInWords(200000), "Two Hundred Thousand Pesos");
  assert.equal(pesosAndCentavosInWords(0), "Zero Pesos");
});

test("countInWords uses the 'Six (6)' house style", () => {
  assert.equal(countInWords(6), "Six (6)");
  assert.equal(countInWords(1), "One (1)");
  assert.equal(countInWords(12), "Twelve (12)");
  assert.equal(countInWords(null), "");
});

test("pctInWords spells the monthly rate LSLGC-style", () => {
  assert.equal(pctInWords(0.025), "Two and Fifty hundredths percent (2.50%)");
  assert.equal(pctInWords(0.03), "Three percent (3.00%)");
  assert.equal(pctInWords(0.0325), "Three and Twenty Five hundredths percent (3.25%)");
  assert.equal(pctInWords(null), "");
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

test("Seafarer context keeps Seafarer loan receivable and no SME keys", () => {
  const ctx = buildReleaseTemplateContext(BLRI, COMPUTATION, BORROWER, "with_pdc");
  const entries = ctx.accountingEntries as Array<{ description: string }>;
  assert.equal(entries[0]?.description, "Loans Receivable - Seafarer Loan");
  assert.equal(ctx.principalShip, "Marlow Navigation Co. Ltd");
  assert.equal(ctx.isSme, undefined);
  assert.equal(ctx.businessCompanyName, undefined);

  const scoped = buildReleaseTemplateContext(
    BLRI,
    COMPUTATION,
    BORROWER,
    "with_pdc",
    { segment: "seafarer" },
  );
  assert.deepEqual(scoped, ctx);
});

test("SME context uses business fields and SME loan receivable", () => {
  const smeBorrower = {
    ...BORROWER,
    manningAgency: undefined,
    picWork: undefined,
    businessInfo: {
      companyName: "Acme Trading Corp.",
      natureOfBusiness: "Wholesale trade",
      officeAddress: "123 Rizal Ave, Quezon City",
    },
  } as unknown as BorrowerProfile;

  const ctx = buildReleaseTemplateContext(
    BLRI,
    COMPUTATION,
    smeBorrower,
    "with_pdc",
    { segment: "sme" },
  );

  const entries = ctx.accountingEntries as Array<{ description: string }>;
  assert.equal(entries[0]?.description, "Loans Receivable - SME Loan");
  assert.equal(ctx.manningAgency, "Acme Trading Corp.");
  assert.equal(ctx.principalShip, "Wholesale trade");
  assert.equal(ctx.businessCompanyName, "Acme Trading Corp.");
  assert.equal(ctx.businessNature, "Wholesale trade");
  assert.equal(ctx.businessAddress, "123 Rizal Ave, Quezon City");
  assert.equal(ctx.isSme, true);
  assert.equal(ctx.isSeafarer, false);
});

test("v2 LSLGC merge keys are present and segment-aware", () => {
  const seafarer = buildReleaseTemplateContext(BLRI, COMPUTATION, BORROWER, "with_pdc");
  // house-style in-words keys derived from the BLRI figures
  assert.equal(
    seafarer.totalLoanAndCentavosInWords,
    "One Hundred Twenty One Thousand Nine Hundred Ninety Seven Pesos & Forty One Cents",
  );
  assert.equal(seafarer.termsInWords, "Seven (7)");
  assert.equal(seafarer.numberOfPdcs, "1");
  assert.equal(seafarer.executionPlace, "Makati City");
  assert.equal(seafarer.lenderRepresentative, "Kristoffer John C. Dela Cruz");
  // structural flags: a seafarer loan is neither corporate nor DTI
  assert.equal(seafarer.isCorporateBorrower, false);
  assert.equal(seafarer.isDtiBorrower, false);
  assert.equal(seafarer.hasSecurityCheck, true);
  assert.deepEqual(seafarer.invoices, []);
  // uncaptured legal fields stay blank rather than blocking generation
  assert.equal(seafarer.boardResolutionNo, "");
  assert.equal(seafarer.notaryDocNo, "");

  const sme = buildReleaseTemplateContext(
    BLRI,
    COMPUTATION,
    {
      ...BORROWER,
      businessInfo: {
        companyName: "Acme Trading Corp.",
        tin: "123-456-789-000",
        companyOfficers: [{ name: "Juan Dela Cruz", position: "President" }],
      },
    } as unknown as BorrowerProfile,
    "with_pdc",
    { segment: "sme" },
  );
  assert.equal(sme.isCorporateBorrower, true);
  assert.equal(sme.borrowerRepresentative, "Juan Dela Cruz");
  assert.equal(sme.borrowerRepresentativeTitle, "President");
  assert.equal(sme.borrowerTin, "123-456-789-000");
});

test("servicing-document keys: loan-derived slots filled, uncaptured stay empty", () => {
  const seafarer = buildReleaseTemplateContext(BLRI, COMPUTATION, BORROWER, "with_pdc");
  const sme = buildReleaseTemplateContext(
    BLRI,
    COMPUTATION,
    { ...BORROWER, businessInfo: { companyName: "Acme Trading Corp." } } as unknown as BorrowerProfile,
    "with_pdc",
    { segment: "sme" },
  );

  // isCorpOrDti drives the cancellation-deed phrasing: SME = corporate, else not.
  assert.equal(seafarer.isCorpOrDti, false);
  assert.equal(sme.isCorpOrDti, true);

  // derived from the loan / BLRI
  assert.equal(seafarer.totalObligation, "121,997.41");
  assert.equal(
    seafarer.totalObligationInWords,
    "One Hundred Twenty One Thousand Nine Hundred Ninety Seven Pesos & Forty One Cents",
  );
  assert.equal(seafarer.amortStartDate, "08/10/26");
  assert.equal(seafarer.chattelReleaseDate, "2026-06-11");
  assert.equal(seafarer.additionalLoanTermMonths, "7");
  assert.equal(seafarer.additionalLoanAmount, "102,605.05");
  assert.equal(seafarer.priorMortgageAmount, "121,997.41");
  assert.equal(seafarer.priorMortgageExecutedOn, "2026-06-11");

  // events that have not happened at release time — blank / empty for the notary
  assert.equal(seafarer.priorMortgageRegistryOfDeeds, "");
  assert.equal(seafarer.surrenderDebtAmount, "");
  assert.equal(seafarer.redemptionPeriod, "");
  assert.equal(seafarer.checkReplacementDate, "");
  assert.equal(seafarer.allLoansTotal, "");
  assert.deepEqual(seafarer.vehicles, []);
  assert.deepEqual(seafarer.properties, []);
  assert.deepEqual(seafarer.priorLoans, []);
  assert.deepEqual(seafarer.replacementChecks, []);
});

test("audit fix: preparedBy/approvedBy resolve from the caller-supplied names; checkedBy stays blank", () => {
  const withNames = buildReleaseTemplateContext(
    BLRI,
    { ...COMPUTATION, preparedByName: "Juan LMA", approvedByName: "Kristoffer KCC" },
    BORROWER,
    "with_pdc",
  );
  assert.equal(withNames.preparedBy, "Juan LMA");
  assert.equal(withNames.approvedBy, "Kristoffer KCC");
  assert.equal(withNames.checkedBy, "");

  // No regression: omitting the names (every pre-existing call site, until
  // threaded) still resolves to blank rather than "undefined" or throwing.
  const withoutNames = buildReleaseTemplateContext(BLRI, COMPUTATION, BORROWER, "with_pdc");
  assert.equal(withoutNames.preparedBy, "");
  assert.equal(withoutNames.approvedBy, "");
});

test("audit fix: checkVoucherNo derives from the loan account no.'s LA->CV prefix swap; checkNumber/checkDate stay blank (no source)", () => {
  const ctx = buildReleaseTemplateContext(BLRI, COMPUTATION, BORROWER, "with_pdc");
  assert.equal(ctx.checkVoucherNo, "CV303342");
  assert.equal(ctx.checkNumber, "");
  assert.equal(ctx.checkDate, "");

  const noPrefix = buildReleaseTemplateContext(
    { ...BLRI, loanAccountNo: "900356" },
    COMPUTATION,
    BORROWER,
    "with_pdc",
  );
  assert.equal(noPrefix.checkVoucherNo, "");
});
