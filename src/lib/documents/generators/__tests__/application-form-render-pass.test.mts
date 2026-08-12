import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { BorrowerProfile } from "@/lib/borrowers/types";
import { mergeTemplate } from "@/lib/documents/render/merge";

import {
  buildApplicationFormContext,
  resolveApplicationFormSlug,
} from "../application-form-context";

const here = dirname(fileURLToPath(import.meta.url));
// __tests__ → generators → documents → lib → src → loanstar root
const root = join(here, "..", "..", "..", "..", "..");
const leftoverToken = new RegExp(String.raw`\{\{[a-zA-Z0-9_]+\}\}`);

function extractBodies(sqlPath: string): Map<string, string> {
  const sql = readFileSync(sqlPath, "utf8");
  const out = new Map<string, string>();
  const re =
    /VALUES\s*\(\s*'([^']+)'[\s\S]*?\$body\$([\s\S]*?)\$body\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) != null) {
    out.set(m[1], m[2].trim());
  }
  return out;
}

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
    manningAgency: { name: "Marlow Navigation", yearsOfStay: "3" },
    financial: { monthlyIncomeUsd: 1200, monthlyIncomePhp: 67200 },
    allottee: { name: "Maria Dela Cruz", relationship: "Spouse" },
    picWork: { rank: "AB", vessel: "MV Star" },
    businessInfo: {},
    dependents: [{ name: "Ana", age: "10", occupation: "Grade 4" }],
    references: [
      {
        name: "Pedro",
        relationship: "Friend",
        phone: "09170001111",
        address: "QC",
      },
    ],
    profileData: {},
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const seafarerBodies = extractBodies(
  join(root, "supabase/migrations/20260714040000_p8_seed_new_document_templates.sql"),
);
const smeBodies = extractBodies(
  join(root, "supabase/migrations/20260807120000_sme_application_form_templates.sql"),
);

test("Phase 4: Seafarer template still prints manning / ship wording with fixture data", () => {
  const body = seafarerBodies.get("application_form");
  assert.ok(body, "application_form body missing from seed migration");

  const ctx = buildApplicationFormContext({
    segment: "seafarer",
    applicationNo: "APP-SF",
    applicationCreatedAt: "2026-06-01T00:00:00Z",
    profile: baseProfile(),
    computation: {
      loanTypeName: "RELOAN ONO SILVER",
      principal: 100000,
      terms: 7,
      interestRate: 0.021,
    },
  });

  const html = mergeTemplate(body!, ctx);
  assert.match(html, /Manning Agency/i);
  assert.match(html, /Principal \/ Ship/i);
  assert.match(html, /Marlow Navigation/);
  assert.match(html, /MV Star/);
  assert.doesNotMatch(html, leftoverToken);

  const seafarerSlug = resolveApplicationFormSlug({ segment: "seafarer" });
  assert.equal(seafarerSlug.ok, true);
  if (seafarerSlug.ok) assert.equal(seafarerSlug.slug, "application_form");
});

test("Phase 4: SME Individual template sections match extraction — no Manning Agency", () => {
  const body = smeBodies.get("application_form_sme_individual");
  assert.ok(body);

  const ctx = buildApplicationFormContext({
    segment: "sme",
    entityType: "individual",
    applicationNo: "APP-IND",
    applicationCreatedAt: "2026-06-01T00:00:00Z",
    profile: baseProfile({
      businessInfo: {
        companyName: "Juan Sari-Sari",
        natureOfBusiness: "Retail",
        companyAddress: "Baliwag",
        position: "Owner",
        businessGrossIncome: "80000",
        businessLessExpenses: "30000",
        businessNetIncome: "50000",
        spouseMonthlyIncome: "25000",
        totalNetIncome: "75000",
        salesAgent: "Agent A",
        spouse: { firstName: "Maria", lastName: "Dela Cruz" },
      },
    }),
  });

  const html = mergeTemplate(body!, ctx);

  assert.match(html, /INDIVIDUAL LOAN APPLICATION/);
  assert.match(html, /I\. APPLICANT DATA/);
  assert.match(html, /II\. SPOUSE INFORMATION/);
  assert.match(html, /III\. REFERENCES/);
  assert.match(html, /IV\. INCOME DECLARATION/);
  assert.match(html, /Juan Sari-Sari/);
  assert.match(html, /Maria/);
  assert.match(html, /80000/);
  assert.match(html, /Ana/);
  assert.match(html, /Pedro/);
  assert.doesNotMatch(html, /Manning Agency/i);
  assert.doesNotMatch(html, /Principal \/ Ship/i);
  assert.doesNotMatch(html, leftoverToken);

  const slug = resolveApplicationFormSlug({
    segment: "sme",
    entityType: "individual",
  });
  assert.ok(slug.ok);
  if (slug.ok) assert.equal(slug.slug, "application_form_sme_individual");
});

test("Phase 4: SME Corporate template sections match extraction — officers/banks present", () => {
  const body = smeBodies.get("application_form_sme_corporate");
  assert.ok(body);

  const ctx = buildApplicationFormContext({
    segment: "sme",
    entityType: "corporate",
    applicationNo: "APP-CORP",
    applicationCreatedAt: "2026-06-01T00:00:00Z",
    profile: baseProfile({
      businessInfo: {
        companyName: "Acme Corp",
        acronym: "AC",
        officeAddress: "Makati",
        natureOfBusiness: "Wholesale",
        tin: "123-456",
        companyOfficers: [
          { name: "Pres One", address: "Makati", position: "President" },
        ],
        majorStockholders: [
          {
            name: "Pres One",
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
            name: "Supply Co",
            address: "Caloocan",
            contactPerson: "Ben",
            contactNo: "2",
          },
        ],
        creditReferences: [
          {
            creditorBank: "BDO",
            typeOfLoan: "Biz",
            outstandingBalance: "100000",
            monthlyPayment: "10000",
            contactNo: "3",
          },
        ],
        bankAccounts: [
          {
            bankName: "BDO",
            branch: "Makati",
            accountNo: "999",
            accountType: "Checking",
            contactNo: "4",
          },
        ],
        bankAuthorizationAccount: "BDO - 999",
      },
    }),
  });

  const html = mergeTemplate(body!, ctx);

  assert.match(html, /CORPORATE LOAN APPLICATION/);
  assert.match(html, /FACTS ABOUT THE COMPANY/);
  assert.match(html, /COMPANY OFFICERS/);
  assert.match(html, /MAJOR STOCKHOLDERS/);
  assert.match(html, /TRADE REFERENCES/);
  assert.match(html, /CREDIT REFERENCES/);
  assert.match(html, /BANK ACCOUNTS/);
  assert.match(html, /REQUIREMENTS/);
  assert.match(html, /Acme Corp/);
  assert.match(html, /Pres One/);
  assert.match(html, /Client A/);
  assert.match(html, /Supply Co/);
  assert.match(html, /BDO/);
  assert.match(html, /SEC Registration/);
  assert.doesNotMatch(html, /Manning Agency/i);
  assert.doesNotMatch(html, leftoverToken);

  const slug = resolveApplicationFormSlug({
    segment: "sme",
    entityType: "corporate",
  });
  assert.ok(slug.ok);
  if (slug.ok) assert.equal(slug.slug, "application_form_sme_corporate");
});

test("Phase 4: replaceUnsigned is scoped by document_slug", () => {
  const src = readFileSync(
    join(root, "src/lib/documents/render-store.ts"),
    "utf8",
  );
  assert.match(src, /\.eq\("document_slug", slug\)/);
  assert.match(src, /replaceUnsigned/);
});
