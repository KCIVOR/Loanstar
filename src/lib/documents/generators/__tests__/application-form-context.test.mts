import test from "node:test";
import assert from "node:assert/strict";

import type { BorrowerProfile } from "@/lib/borrowers/types";

import {
  buildApplicationFormContext,
  resolveApplicationFormSlug,
} from "../application-form-context";

function baseProfile(overrides: Partial<BorrowerProfile> = {}): BorrowerProfile {
  return {
    id: "b1",
    userId: "u1",
    borrowerNo: "BN100",
    email: "a@example.com",
    firstName: "Juan",
    middleName: "C",
    lastName: "Dela Cruz",
    suffix: null,
    dateOfBirth: "1985-05-14",
    placeOfBirth: "Baliwag",
    citizenship: "Filipino",
    civilStatus: "Married",
    gender: "Male",
    mobilePhone: "09171234567",
    landline: "0281230000",
    presentAddress: {
      street: "1 Main St",
      city: "Baliwag",
      province: "Bulacan",
      lengthOfStay: "5",
      ownership: "Owned",
    },
    permanentAddress: { city: "Baliwag", province: "Bulacan" },
    manningAgency: {
      name: "Marlow Navigation",
      crewingManager: "Maria",
      crewingManagerContact: "0917",
      yearsOfStay: "3",
      departureDate: "2026-01-15",
      previousAgency: "Old Agency",
      previousSignOffDate: "2025-01-01",
      reasonForTransfer: "Career",
    },
    financial: {
      monthlyIncomeUsd: 1200,
      monthlyIncomePhp: 67200,
      householdExpensesPhp: 25000,
      otherLoansPhp: 0,
    },
    allottee: {
      name: "Maria Dela Cruz",
      relationship: "Spouse",
      phone: "09179876543",
      allotmentPercent: "80%",
    },
    picWork: { rank: "AB", vessel: "MV Star", contractDuration: "9 months" },
    businessInfo: {},
    dependents: [{ name: "Ana", age: "10", occupation: "Grade 4" }],
    references: [
      {
        name: "Pedro",
        relationship: "Friend",
        phone: "09170001111",
        occupation: "Teacher",
        address: "QC",
      },
    ],
    profileData: { facebook: "juan.dc" },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const computation = {
  loanTypeName: "RELOAN ONO SILVER",
  principal: 100000,
  terms: 7,
  interestRate: 0.021,
};

// --- resolveApplicationFormSlug ---

test("resolveApplicationFormSlug: seafarer → application_form", () => {
  assert.deepEqual(resolveApplicationFormSlug({ segment: "seafarer" }), {
    ok: true,
    slug: "application_form",
  });
  assert.deepEqual(resolveApplicationFormSlug({}), {
    ok: true,
    slug: "application_form",
  });
});

test("resolveApplicationFormSlug: sme + individual", () => {
  assert.deepEqual(
    resolveApplicationFormSlug({ segment: "sme", entityType: "individual" }),
    { ok: true, slug: "application_form_sme_individual" },
  );
});

test("resolveApplicationFormSlug: sme + corporate", () => {
  assert.deepEqual(
    resolveApplicationFormSlug({ segment: "sme", entityType: "corporate" }),
    { ok: true, slug: "application_form_sme_corporate" },
  );
});

test("resolveApplicationFormSlug: sme without entityType is rejected", () => {
  const result = resolveApplicationFormSlug({ segment: "sme" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /entity type/i);
});

test("resolveApplicationFormSlug: sme with invalid entityType is rejected", () => {
  const result = resolveApplicationFormSlug({
    segment: "sme",
    entityType: "partnership",
  });
  assert.equal(result.ok, false);
});

// --- buildApplicationFormContext — Seafarer stability ---

test("Seafarer context keeps manning/allottee keys and does not set isSme", () => {
  const ctx = buildApplicationFormContext({
    segment: "seafarer",
    applicationNo: "APP1",
    applicationCreatedAt: "2026-06-01T00:00:00Z",
    profile: baseProfile(),
    computation,
  });

  assert.equal(ctx.manningAgency, "Marlow Navigation");
  assert.equal(ctx.principalShip, "MV Star");
  assert.equal(ctx.rank, "AB");
  assert.equal(ctx.allotteeName, "Maria Dela Cruz");
  assert.equal(ctx.monthlyIncomeUsd, "1,200.00");
  assert.equal(ctx.loanType, "RELOAN ONO SILVER");
  assert.equal(ctx.loanAmount, "100,000.00");
  assert.equal(ctx.interestRate, "2.10%");
  assert.equal(ctx.isSme, undefined);
  assert.equal(ctx.isSeafarer, undefined);
  assert.equal(ctx.businessCompanyName, undefined);
});

test("Seafarer context includes dependents and references arrays", () => {
  const ctx = buildApplicationFormContext({
    segment: "seafarer",
    profile: baseProfile(),
  });
  assert.deepEqual(ctx.dependents, [
    { name: "Ana", age: "10", contactNo: "", occupation: "Grade 4" },
  ]);
  assert.deepEqual(ctx.references, [
    {
      name: "Pedro",
      relationship: "Friend",
      phone: "09170001111",
      occupation: "Teacher",
      address: "QC",
    },
  ]);
});

// --- SME Individual ---

test("SME Individual context exposes income + spouse keys and does not remap manning", () => {
  const ctx = buildApplicationFormContext({
    segment: "sme",
    entityType: "individual",
    applicationNo: "APP-SME-1",
    applicationCreatedAt: "2026-06-01T00:00:00Z",
    profile: baseProfile({
      businessInfo: {
        companyName: "Juan Sari-Sari",
        natureOfBusiness: "Retail",
        companyAddress: "Baliwag",
        position: "Owner",
        tin: "111-222-333",
        businessGrossIncome: "80000",
        businessLessExpenses: "30000",
        businessNetIncome: "50000",
        spouseMonthlyIncome: "25000",
        sourceOfIncome: "Rental",
        otherIncome: "10000",
        totalNetIncome: "85000",
        salesAgent: "Agent A",
        spouse: {
          lastName: "Dela Cruz",
          firstName: "Maria",
          middleName: "C",
          position: "Cashier",
        },
      },
    }),
    computation,
  });

  assert.equal(ctx.isSme, true);
  assert.equal(ctx.isSeafarer, false);
  assert.equal(ctx.manningAgency, "");
  assert.equal(ctx.principalShip, "");
  assert.equal(ctx.allotteeName, "");
  assert.equal(ctx.businessCompanyName, "Juan Sari-Sari");
  assert.equal(ctx.businessNature, "Retail");
  assert.equal(ctx.businessTin, "111-222-333");
  assert.equal(ctx.ownGrossIncome, "80000");
  assert.equal(ctx.ownLessExpenses, "30000");
  assert.equal(ctx.ownNetIncome, "50000");
  assert.equal(ctx.spouseGrossIncome, "25000");
  assert.equal(ctx.spouseLessExpenses, "");
  assert.equal(ctx.spouseNetIncome, "25000");
  assert.equal(ctx.otherIncomeSource, "Rental");
  assert.equal(ctx.totalNetIncome, "85000");
  assert.equal(ctx.spouseFirstName, "Maria");
  assert.equal(ctx.spouseLastName, "Dela Cruz");
  assert.equal(ctx.spousePosition, "Cashier");
  assert.equal(ctx.salesAgent, "Agent A");
  assert.equal(ctx.typeOfLoan, "Business Loan");
});

test("SME Individual prefers explicit spouse income scalars over legacy spouseMonthlyIncome", () => {
  const ctx = buildApplicationFormContext({
    segment: "sme",
    entityType: "individual",
    profile: baseProfile({
      businessInfo: {
        spouseMonthlyIncome: "1",
        spouseGrossIncome: "30000",
        spouseLessExpenses: "5000",
        spouseNetIncome: "25000",
      },
    }),
  });
  assert.equal(ctx.spouseGrossIncome, "30000");
  assert.equal(ctx.spouseLessExpenses, "5000");
  assert.equal(ctx.spouseNetIncome, "25000");
});

// --- SME Corporate ---

test("SME Corporate context includes officers and stockholders arrays", () => {
  const ctx = buildApplicationFormContext({
    segment: "sme",
    entityType: "corporate",
    profile: baseProfile({
      businessInfo: {
        companyName: "Acme Corp",
        acronym: "AC",
        officeAddress: "Makati",
        tin: "999",
        companyOfficers: [
          { name: "Pres", address: "Makati", position: "President" },
        ],
        majorStockholders: [
          {
            name: "Pres",
            address: "Makati",
            position: "Director",
            equity: "60%",
          },
        ],
        tradeCustomers: [
          {
            name: "Client A",
            address: "Pasig",
            contactPerson: "Ana",
            contactNo: "1",
          },
        ],
        tradeSuppliers: [
          {
            name: "Supply",
            address: "Caloocan",
            contactPerson: "Ben",
            contactNo: "2",
          },
        ],
        creditReferences: [
          {
            creditorBank: "BDO",
            typeOfLoan: "Biz",
            outstandingBalance: "100",
            monthlyPayment: "10",
            contactNo: "3",
          },
        ],
        bankAccounts: [
          {
            bankName: "BDO",
            branch: "Makati",
            accountNo: "123",
            accountType: "Checking",
            contactNo: "4",
          },
        ],
        bankAuthorizationAccount: "BDO — 123",
      },
    }),
  });

  assert.equal(ctx.businessCompanyName, "Acme Corp");
  assert.equal(ctx.businessAcronym, "AC");
  assert.equal(ctx.manningAgency, "");
  assert.deepEqual(ctx.companyOfficers, [
    { name: "Pres", address: "Makati", position: "President" },
  ]);
  assert.deepEqual(ctx.majorStockholders, [
    { name: "Pres", address: "Makati", position: "Director", equity: "60%" },
  ]);
  assert.equal((ctx.tradeCustomers as unknown[]).length, 1);
  assert.equal((ctx.tradeSuppliers as unknown[]).length, 1);
  assert.equal((ctx.creditReferences as unknown[]).length, 1);
  assert.equal((ctx.bankAccounts as unknown[]).length, 1);
  assert.equal(ctx.bankAuthorizationAccount, "BDO — 123");
});
