import test from "node:test";
import assert from "node:assert/strict";

import { mapComputationRow } from "../../csa/computation";
import { buildBlriData } from "../blri-data";

/**
 * Audit fix (Calculator SME.xlsm is the source of truth for what the BLRI /
 * Check Voucher / Cash Voucher particulars table must show): Notary Fee,
 * Chattel Mortgage Fee, and the Other-Deductions breakdown are real,
 * already-computed `computations` columns that never reached `particulars`
 * before this fix. Built via `mapComputationRow` (a plain row object, like
 * `getActiveComputation` does) rather than a hand-typed fixture, so this test
 * can't drift out of sync with the mapper's real shape.
 */

const BORROWER = {
  id: "b1",
  borrowerNo: "BR-001",
  userId: null,
  email: "test@example.com",
  firstName: "Acme",
  lastName: "Trading Corp.",
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
} as unknown as Parameters<typeof buildBlriData>[0]["borrower"];

function computationRow(overrides: Record<string, unknown> = {}) {
  return mapComputationRow({
    id: "c1",
    loan_application_id: "a1",
    version: 1,
    input_mode: "NET_SARADO",
    input_amount: 500_000,
    terms: 12,
    addon_months: 0,
    pf_rate: 0.06,
    interest_rate: 0.025,
    security_fee_rate: 0,
    loan_type_id: null,
    loan_type_name: "SME Business Loan",
    other_deductions: {},
    principal: 500_000,
    processing_fee: 30_000,
    admin_cost: 0,
    doc_stamp: 0,
    notary_fee: 0,
    security_fee: 0,
    other_deductions_total: 0,
    total_deductions: 30_000,
    net_released: 470_000,
    total_interest: 75_000,
    gross_total_interest: 75_000,
    total_loan: 575_000,
    monthly_amortization: 47_916.67,
    release_date: "2026-06-11",
    first_payment_date: "2026-07-11",
    due_day: 11,
    origination_discounts: null,
    line_items: [
      { key: "processing_fee", label: "Processing Fee", amount: 30_000 },
      { key: "admin_cost", label: "Admin Cost", amount: 0 },
      { key: "doc_stamp", label: "Doc Stamp", amount: 0 },
      { key: "notary_fee", label: "Notary Fee", amount: 0 },
      { key: "security_fee", label: "Security Fee", amount: 0 },
    ],
    coverage_ratio: null,
    coverage_warning: false,
    admin_rate: null,
    chattel_rate: null,
    chattel_fee: null,
    with_ds_and_notary: true,
    payment_frequency: "monthly",
    computed_by: null,
    signed_at: null,
    signed_by: null,
    witnessed_by: null,
    is_active: true,
    created_at: "",
    ...overrides,
  });
}

test("particulars still show the 4 original fees when everything else is zero (no regression)", () => {
  const blri = buildBlriData({
    applicationNo: "LA900001",
    borrower: BORROWER,
    computation: computationRow(),
  });

  const labels = blri.particulars.map((p) => p.label);
  assert.deepEqual(labels, ["Processing Fee", "Admin Cost", "Doc Stamp", "Security Fee"]);
});

test("Notary Fee appears (with its GL code) only when non-zero", () => {
  const withFee = buildBlriData({
    applicationNo: "LA900001",
    borrower: BORROWER,
    computation: computationRow({
      notary_fee: 2_902.5,
      line_items: [
        { key: "processing_fee", label: "Processing Fee", amount: 30_000 },
        { key: "notary_fee", label: "Notary Fee", amount: 2_902.5 },
      ],
    }),
  });
  const notary = withFee.particulars.find((p) => p.label === "Notary Fee");
  assert.ok(notary, "expected a Notary Fee line");
  assert.equal(notary!.amount, 2_902.5);
  assert.equal(notary!.accountCode, "5003011");

  const withoutFee = buildBlriData({
    applicationNo: "LA900001",
    borrower: BORROWER,
    computation: computationRow(),
  });
  assert.equal(
    withoutFee.particulars.find((p) => p.label === "Notary Fee"),
    undefined,
  );
});

test("Chattel Mortgage Fee appears only when the computation has one", () => {
  const withChattel = buildBlriData({
    applicationNo: "LA900001",
    borrower: BORROWER,
    computation: computationRow({ chattel_fee: 5_000 }),
  });
  const chattel = withChattel.particulars.find((p) => p.label === "Chattel Mortgage Fee");
  assert.ok(chattel, "expected a Chattel Mortgage Fee line");
  assert.equal(chattel!.amount, 5_000);

  const withoutChattel = buildBlriData({
    applicationNo: "LA900001",
    borrower: BORROWER,
    computation: computationRow(),
  });
  assert.equal(
    withoutChattel.particulars.find((p) => p.label === "Chattel Mortgage Fee"),
    undefined,
  );
});

test("Other Deductions expand into one row per real entry (Previous Loan Balance, Advance Payment, Offset)", () => {
  const blri = buildBlriData({
    applicationNo: "LA900001",
    borrower: BORROWER,
    computation: computationRow({
      other_deductions: {
        previousLoanBalance: 425_597.64,
        advancePayment: 10_000,
        offsets: [{ accountNo: "AN300002", amount: 15_000, months: 3 }],
      },
    }),
  });

  const labels = blri.particulars.map((p) => p.label);
  assert.ok(labels.includes("Previous Loan Balance"));
  assert.ok(labels.includes("Advance Payment"));
  // Note: `deduction-breakdown.ts`'s own label helpers are named the reverse
  // of what they produce (`offsetLabel()` emits "Other Loan (...)" for the
  // `offsets[]` bucket) — pre-existing, out of this fix's scope; asserting
  // the real behavior, not the confusing names.
  assert.ok(labels.some((l) => l.startsWith("Other Loan (AN300002")));

  const prevLoan = blri.particulars.find((p) => p.label === "Previous Loan Balance");
  assert.equal(prevLoan!.amount, 425_597.64);
});

test("particulars order: fixed 4, then Notary Fee, then Chattel Mortgage Fee, then Other Deductions", () => {
  const blri = buildBlriData({
    applicationNo: "LA900001",
    borrower: BORROWER,
    computation: computationRow({
      notary_fee: 100,
      chattel_fee: 200,
      other_deductions: { advancePayment: 300 },
      line_items: [{ key: "notary_fee", label: "Notary Fee", amount: 100 }],
    }),
  });
  assert.deepEqual(blri.particulars.map((p) => p.label), [
    "Processing Fee",
    "Admin Cost",
    "Doc Stamp",
    "Security Fee",
    "Notary Fee",
    "Chattel Mortgage Fee",
    "Advance Payment",
  ]);
});
