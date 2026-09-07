import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { addScheduleMonths, advanceSemiMonthly } from "@/lib/computation/release-date";
import { halfUp } from "@/lib/computation/money";
import { computeInvoiceLoan } from "@/lib/computation/invoice";
import {
  generateBiMonthlySchedule,
  generateQuarterlySchedule,
  generateQuarterlySpecialSchedule,
  generateTwoMonthlySchedule,
  generateTwoMonthlySpecialSchedule,
} from "@/lib/ar/schedule";
import { invoiceScheduleToInstallments } from "@/lib/ar/masterlist";

import { savePdcChecks } from "../release-service";

type StubOpts = {
  terms: number;
  monthlyAmortization: number;
  releasePath?: string;
  firstPaymentDate?: string | null;
  paymentFrequency?:
    | "monthly"
    | "semi_monthly"
    | "weekly"
    | "bi_monthly"
    | "quarterly"
    | "two_monthly"
    | "daily"
    | "quarterly_special"
    | "two_monthly_special";
  totalLoan?: number;
  totalInterest?: number;
  grossTotalInterest?: number;
  releaseDate?: string | null;
  principal?: number;
  dueDay?: number;
};

const FIRST_PAYMENT_DATE = "2026-08-12";

function makeCheckRow(
  amount: number,
  index = 0,
  anchor: string = FIRST_PAYMENT_DATE,
) {
  return {
    checkNumber: String(1001 + index),
    amount,
    checkDate: addScheduleMonths(anchor, index),
    bankName: "Test Bank",
  };
}

function makeChecks(
  count: number,
  amount: number,
  anchor: string = FIRST_PAYMENT_DATE,
) {
  return Array.from({ length: count }, (_, i) => makeCheckRow(amount, i, anchor));
}

function makeSavePdcStub(opts: StubOpts) {
  let insertedChecks: unknown[] | null = null;
  let releaseFileUpdated: Record<string, unknown> | null = null;

  const releaseFileRow = {
    id: "rf-1",
    loan_application_id: "app-1",
    computation_id: "comp-1",
    release_paths: [opts.releasePath ?? "with_pdc"],
    status: "pdc_encoding",
    blank_check_from: null,
    blank_check_to: null,
    atm_bank_name: null,
    atm_card_last4: null,
    assigned_to: null,
    pdc_collected_at: null,
    pdc_collected_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };

  // Self-consistent by construction (principal + totalInterest = totalLoan,
  // and totalLoan reconciles with monthlyAmortization * terms when totalLoan
  // isn't explicitly overridden) — savePdcChecks now derives its gross PDC
  // basis from principal + grossTotalInterest (mirroring
  // initializeArAccount, see
  // docs/ledger-balance-consistency-fix-implementation-plan.md Phase 1),
  // not from totalLoan/monthlyAmortization directly, so a stub whose
  // principal/totalInterest/totalLoan/monthlyAmortization don't reconcile no
  // longer reflects a real computation. gross_total_interest is
  // intentionally omitted from computationRow (undiscounted fixture) —
  // mapComputationRow falls back to total_interest, which is what these
  // opts already control.
  const resolvedTotalInterest = opts.totalInterest ?? 0;
  const resolvedTotalLoan =
    opts.totalLoan ?? halfUp(opts.monthlyAmortization * opts.terms);
  const resolvedPrincipal =
    opts.principal !== undefined
      ? opts.principal
      : resolvedTotalLoan - resolvedTotalInterest;

  const computationRow = {
    id: "comp-1",
    loan_application_id: "app-1",
    version: 1,
    is_active: true,
    terms: opts.terms,
    monthly_amortization: opts.monthlyAmortization,
    input_mode: "principal",
    input_amount: 100000,
    addon_months: 0,
    pf_rate: 0,
    interest_rate: 0,
    security_fee_rate: 0,
    loan_type_id: null,
    loan_type_name: null,
    other_deductions: {},
    principal: resolvedPrincipal,
    processing_fee: 0,
    admin_cost: 0,
    doc_stamp: 0,
    notary_fee: 0,
    security_fee: 0,
    other_deductions_total: 0,
    total_deductions: 0,
    net_released: 100000,
    total_interest: resolvedTotalInterest,
    gross_total_interest: opts.grossTotalInterest ?? null,
    total_loan: resolvedTotalLoan,
    release_date: opts.releaseDate === undefined ? null : opts.releaseDate,
    first_payment_date:
      opts.firstPaymentDate === undefined
        ? FIRST_PAYMENT_DATE
        : opts.firstPaymentDate,
    due_day: opts.dueDay ?? null,
    line_items: [],
    payment_frequency: opts.paymentFrequency ?? "monthly",
  };

  const supabase = {
    from(table: string) {
      if (table === "release_files") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: releaseFileRow, error: null }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            releaseFileUpdated = payload;
            return {
              eq: async () => ({ error: null }),
            };
          },
        };
      }
      if (table === "computations") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({ data: computationRow, error: null }),
        };
        return chain;
      }
      if (table === "pdc_checks") {
        return {
          delete: () => ({
            eq: async () => ({ error: null }),
          }),
          insert: (rows: unknown[]) => {
            insertedChecks = rows;
            return Promise.resolve({ error: null });
          },
        };
      }
      if (table === "loan_applications") {
        return {
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  return {
    supabase: supabase as never,
    getInsertedChecks: () => insertedChecks,
    getReleaseFileUpdated: () => releaseFileUpdated,
  };
}

describe("savePdcChecks hard lock", () => {
  it("throws when check count is below loan term", async () => {
    const stub = makeSavePdcStub({ terms: 12, monthlyAmortization: 5000 });

    await assert.rejects(
      () =>
        savePdcChecks(
          stub.supabase,
          "rf-1",
          makeChecks(10, 5000),
          undefined,
          "actor-1",
        ),
      /Number of checks must equal the loan term \(12\)/,
    );

    assert.equal(stub.getInsertedChecks(), null);
  });

  it("throws when check count exceeds loan term", async () => {
    const stub = makeSavePdcStub({ terms: 12, monthlyAmortization: 5000 });

    await assert.rejects(
      () =>
        savePdcChecks(
          stub.supabase,
          "rf-1",
          makeChecks(14, 5000),
          undefined,
          "actor-1",
        ),
      /Number of checks must equal the loan term \(12\)/,
    );

    assert.equal(stub.getInsertedChecks(), null);
  });

  it("throws when any check amount differs from monthly amortization", async () => {
    const stub = makeSavePdcStub({ terms: 3, monthlyAmortization: 5000 });
    const checks = makeChecks(3, 5000);
    checks[1] = makeCheckRow(4999, 1);

    await assert.rejects(
      () =>
        savePdcChecks(stub.supabase, "rf-1", checks, undefined, "actor-1"),
      /Check amount must equal the monthly amortization \(₱5000\)/,
    );

    assert.equal(stub.getInsertedChecks(), null);
  });

  it("throws when any check number is blank", async () => {
    const stub = makeSavePdcStub({ terms: 3, monthlyAmortization: 5000 });
    const checks = makeChecks(3, 5000);
    checks[1] = { ...checks[1], checkNumber: "   " };

    await assert.rejects(
      () =>
        savePdcChecks(stub.supabase, "rf-1", checks, undefined, "actor-1"),
      /Check number is required for every PDC/,
    );

    assert.equal(stub.getInsertedChecks(), null);
  });

  it("throws when any bank or branch is blank", async () => {
    const stub = makeSavePdcStub({ terms: 3, monthlyAmortization: 5000 });
    const checks = makeChecks(3, 5000);
    checks[1] = { ...checks[1], bankName: "   " };

    await assert.rejects(
      () =>
        savePdcChecks(stub.supabase, "rf-1", checks, undefined, "actor-1"),
      /Bank\/Branch is required for every PDC/,
    );

    assert.equal(stub.getInsertedChecks(), null);
  });

  it("trims check numbers and bank branches before inserting", async () => {
    const stub = makeSavePdcStub({ terms: 1, monthlyAmortization: 5000 });
    const checks = [
      {
        ...makeCheckRow(5000),
        checkNumber: "  1001  ",
        bankName: "  Test Bank / Main  ",
      },
    ];

    await savePdcChecks(
      stub.supabase,
      "rf-1",
      checks,
      undefined,
      "actor-1",
    );

    assert.deepEqual(stub.getInsertedChecks(), [
      {
        release_file_id: "rf-1",
        check_number: "1001",
        amount: 5000,
        check_date: "2026-08-12",
        bank_name: "Test Bank / Main",
        ref_account: null,
        sort_order: 0,
      },
    ]);
  });

  it("succeeds and writes pdc_checks when count and amounts match", async () => {
    const stub = makeSavePdcStub({ terms: 3, monthlyAmortization: 5000 });
    const checks = makeChecks(3, 5000);

    const result = await savePdcChecks(
      stub.supabase,
      "rf-1",
      checks,
      { from: "2001", to: "2003" },
      "actor-1",
    );

    assert.equal(result.status, "ready_generate");
    assert.equal(result.checkCount, 3);
    assert.equal(result.terms, 3);
    assert.equal(stub.getInsertedChecks()?.length, 3);
    assert.equal(stub.getReleaseFileUpdated()?.status, "ready_generate");
    assert.equal(stub.getReleaseFileUpdated()?.blank_check_from, "2001");
    assert.equal(stub.getReleaseFileUpdated()?.blank_check_to, "2003");
  });

  it("throws when the computation has no recorded payment start date", async () => {
    const stub = makeSavePdcStub({
      terms: 3,
      monthlyAmortization: 5000,
      firstPaymentDate: null,
    });
    const checks = makeChecks(3, 5000);

    await assert.rejects(
      () =>
        savePdcChecks(stub.supabase, "rf-1", checks, undefined, "actor-1"),
      /no payment start date recorded/,
    );

    assert.equal(stub.getInsertedChecks(), null);
  });

  it("throws when the first check date doesn't match the computed schedule", async () => {
    const stub = makeSavePdcStub({ terms: 3, monthlyAmortization: 5000 });
    const checks = makeChecks(3, 5000, "2026-09-12");

    await assert.rejects(
      () =>
        savePdcChecks(stub.supabase, "rf-1", checks, undefined, "actor-1"),
      /PDC #1 date must be 2026-08-12/,
    );

    assert.equal(stub.getInsertedChecks(), null);
  });

  it("throws when a middle check date is shifted off the computed schedule", async () => {
    const stub = makeSavePdcStub({ terms: 3, monthlyAmortization: 5000 });
    const checks = makeChecks(3, 5000);
    checks[1] = { ...checks[1], checkDate: "2026-10-12" };

    await assert.rejects(
      () =>
        savePdcChecks(stub.supabase, "rf-1", checks, undefined, "actor-1"),
      /PDC #2 date must be 2026-09-12 \(got 2026-10-12\)/,
    );

    assert.equal(stub.getInsertedChecks(), null);
  });

  it("succeeds when every check date follows the computed schedule exactly", async () => {
    const stub = makeSavePdcStub({ terms: 3, monthlyAmortization: 5000 });
    const checks = makeChecks(3, 5000);

    const result = await savePdcChecks(
      stub.supabase,
      "rf-1",
      checks,
      undefined,
      "actor-1",
    );

    assert.equal(result.status, "ready_generate");
    assert.deepEqual(
      stub.getInsertedChecks()?.map((c) => (c as { check_date: string }).check_date),
      ["2026-08-12", "2026-09-12", "2026-10-12"],
    );
  });
});

describe("savePdcChecks hard lock (semi-monthly / Salary)", () => {
  const SEMI_FIRST = "2026-08-31";
  const TERMS = 6;
  const MONTHLY_AMORTIZATION = 21578.33;
  const TOTAL_LOAN = 129470;
  const HALF = halfUp(MONTHLY_AMORTIZATION / 2);

  function makeSemiMonthlyChecks(
    count: number,
    anchor: string = SEMI_FIRST,
    totalLoan: number = TOTAL_LOAN,
  ) {
    const lastAmount = halfUp(totalLoan - halfUp(HALF * (count - 1)));
    return Array.from({ length: count }, (_, i) => ({
      checkNumber: String(2001 + i),
      amount: i === count - 1 ? lastAmount : HALF,
      checkDate: advanceSemiMonthly(anchor, i),
      bankName: "Test Bank",
    }));
  }

  it("throws when semi-monthly check count is below terms * 2", async () => {
    const stub = makeSavePdcStub({
      terms: TERMS,
      monthlyAmortization: MONTHLY_AMORTIZATION,
      paymentFrequency: "semi_monthly",
      totalLoan: TOTAL_LOAN,
      firstPaymentDate: SEMI_FIRST,
    });

    await assert.rejects(
      () =>
        savePdcChecks(
          stub.supabase,
          "rf-1",
          makeSemiMonthlyChecks(10),
          undefined,
          "actor-1",
        ),
      /Number of checks must equal twice the loan term \(12\)/,
    );
    assert.equal(stub.getInsertedChecks(), null);
  });

  it("throws when semi-monthly check count exceeds terms * 2", async () => {
    const stub = makeSavePdcStub({
      terms: TERMS,
      monthlyAmortization: MONTHLY_AMORTIZATION,
      paymentFrequency: "semi_monthly",
      totalLoan: TOTAL_LOAN,
      firstPaymentDate: SEMI_FIRST,
    });

    await assert.rejects(
      () =>
        savePdcChecks(
          stub.supabase,
          "rf-1",
          makeSemiMonthlyChecks(14),
          undefined,
          "actor-1",
        ),
      /Number of checks must equal twice the loan term \(12\)/,
    );
    assert.equal(stub.getInsertedChecks(), null);
  });

  it("throws when a semi-monthly check amount isn't the half-amortization", async () => {
    const stub = makeSavePdcStub({
      terms: TERMS,
      monthlyAmortization: MONTHLY_AMORTIZATION,
      paymentFrequency: "semi_monthly",
      totalLoan: TOTAL_LOAN,
      firstPaymentDate: SEMI_FIRST,
    });
    const checks = makeSemiMonthlyChecks(12);
    checks[1] = { ...checks[1], amount: HALF + 1 };

    await assert.rejects(
      () =>
        savePdcChecks(stub.supabase, "rf-1", checks, undefined, "actor-1"),
      new RegExp(`Check amount must equal ₱${HALF} for PDC #2`),
    );
    assert.equal(stub.getInsertedChecks(), null);
  });

  it("throws when a semi-monthly check date doesn't alternate correctly", async () => {
    const stub = makeSavePdcStub({
      terms: TERMS,
      monthlyAmortization: MONTHLY_AMORTIZATION,
      paymentFrequency: "semi_monthly",
      totalLoan: TOTAL_LOAN,
      firstPaymentDate: SEMI_FIRST,
    });
    const checks = makeSemiMonthlyChecks(12);
    checks[1] = { ...checks[1], checkDate: "2026-10-15" };

    await assert.rejects(
      () =>
        savePdcChecks(stub.supabase, "rf-1", checks, undefined, "actor-1"),
      /PDC #2 date must be 2026-09-15 \(got 2026-10-15\)/,
    );
    assert.equal(stub.getInsertedChecks(), null);
  });

  it("succeeds with a correct 12-check semi-monthly schedule — alternating dates, half amounts, last absorbs rounding, sums to totalLoan", async () => {
    const stub = makeSavePdcStub({
      terms: TERMS,
      monthlyAmortization: MONTHLY_AMORTIZATION,
      paymentFrequency: "semi_monthly",
      totalLoan: TOTAL_LOAN,
      firstPaymentDate: SEMI_FIRST,
    });
    const checks = makeSemiMonthlyChecks(12);

    const result = await savePdcChecks(
      stub.supabase,
      "rf-1",
      checks,
      undefined,
      "actor-1",
    );

    assert.equal(result.status, "ready_generate");
    const inserted = stub.getInsertedChecks() as Array<{
      check_date: string;
      amount: number;
    }>;
    assert.equal(inserted.length, 12);
    assert.deepEqual(
      inserted.map((c) => c.check_date),
      [
        "2026-08-31",
        "2026-09-15",
        "2026-09-30",
        "2026-10-15",
        "2026-10-31",
        "2026-11-15",
        "2026-11-30",
        "2026-12-15",
        "2026-12-31",
        "2027-01-15",
        "2027-01-31",
        "2027-02-15",
      ],
    );
    // First 11 checks are the flat half-amortization; the last absorbs rounding.
    for (const row of inserted.slice(0, 11)) {
      assert.equal(row.amount, HALF);
    }
    const sum = inserted.reduce((total, row) => halfUp(total + row.amount), 0);
    assert.equal(sum, TOTAL_LOAN);
  });
});

describe("savePdcChecks hard lock (Invoice / weekly)", () => {
  const RELEASE_DATE = "2026-09-01";
  const expected = invoiceScheduleToInstallments(
    computeInvoiceLoan({
      principal: 100000,
      terms: 3,
      releaseDate: new Date(RELEASE_DATE),
    }),
  );

  function makeStub() {
    return makeSavePdcStub({
      terms: 3,
      monthlyAmortization: 0,
      paymentFrequency: "weekly",
      releaseDate: RELEASE_DATE,
      totalLoan: 100000,
      principal: 100000,
    });
  }

  function checksFromExpected() {
    return expected.map((row, i) => ({
      checkNumber: String(1001 + i),
      amount: row.amountDue,
      checkDate: row.dueDate,
      bankName: "Test Bank",
    }));
  }

  it("requires exactly 13 checks (12 weekly interest + 1 principal)", async () => {
    const stub = makeStub();
    await assert.rejects(
      () =>
        savePdcChecks(
          stub.supabase,
          "rf-1",
          checksFromExpected().slice(0, 12),
          undefined,
          "actor-1",
        ),
      /Number of checks must equal 13/,
    );
  });

  it("rejects a flat monthly-shaped amount instead of the escalating weekly schedule", async () => {
    const stub = makeStub();
    const checks = checksFromExpected();
    checks[8] = { ...checks[8], amount: 1000 }; // week 9 should be 2500, not 1000
    await assert.rejects(
      () => savePdcChecks(stub.supabase, "rf-1", checks, undefined, "actor-1"),
      /Check amount must equal ₱2500 for PDC #9/,
    );
  });

  it("succeeds with the correct 13-check Invoice schedule", async () => {
    const stub = makeStub();
    const result = await savePdcChecks(
      stub.supabase,
      "rf-1",
      checksFromExpected(),
      undefined,
      "actor-1",
    );
    assert.equal(result.status, "ready_generate");
    const inserted = stub.getInsertedChecks() as Array<{ amount: number }>;
    assert.equal(inserted.length, 13);
    assert.equal(inserted[12].amount, 100000); // final principal check
  });
});

describe("savePdcChecks hard lock (Daily)", () => {
  it("requires exactly 1 check, for computation.totalLoan on firstPaymentDate", async () => {
    const stub = makeSavePdcStub({
      terms: 1,
      monthlyAmortization: 0,
      paymentFrequency: "daily",
      firstPaymentDate: "2026-08-25",
      totalLoan: 100500,
    });

    await assert.rejects(
      () =>
        savePdcChecks(
          stub.supabase,
          "rf-1",
          [
            { checkNumber: "1001", amount: 100500, checkDate: "2026-08-26", bankName: "Test Bank" },
          ],
          undefined,
          "actor-1",
        ),
      /PDC #1 date must be 2026-08-25/,
    );

    const result = await savePdcChecks(
      stub.supabase,
      "rf-1",
      [
        { checkNumber: "1001", amount: 100500, checkDate: "2026-08-25", bankName: "Test Bank" },
      ],
      undefined,
      "actor-1",
    );
    assert.equal(result.status, "ready_generate");
    const inserted = stub.getInsertedChecks() as Array<{ amount: number; check_date: string }>;
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].amount, 100500);
    assert.equal(inserted[0].check_date, "2026-08-25");
  });
});

describe("savePdcChecks hard lock (Bi-Monthly)", () => {
  const RELEASE_DATE = "2026-09-01";
  const expected = generateBiMonthlySchedule({
    terms: 6,
    monthlyAmortization: 20000,
    releaseDate: new Date(RELEASE_DATE),
    totalLoan: 120000,
  });

  it("requires 12 checks (terms × 2), 15 days apart, half the monthly amount each", async () => {
    const stub = makeSavePdcStub({
      terms: 6,
      monthlyAmortization: 20000,
      paymentFrequency: "bi_monthly",
      releaseDate: RELEASE_DATE,
      totalLoan: 120000,
    });

    const checks = expected.map((row, i) => ({
      checkNumber: String(1001 + i),
      amount: row.amountDue,
      checkDate: row.dueDate,
      bankName: "Test Bank",
    }));

    const result = await savePdcChecks(stub.supabase, "rf-1", checks, undefined, "actor-1");
    assert.equal(result.status, "ready_generate");
    const inserted = stub.getInsertedChecks() as Array<{ amount: number; check_date: string }>;
    assert.equal(inserted.length, 12);
    assert.equal(inserted[0].check_date, "2026-09-16"); // release + 15 days
    assert.equal(inserted[0].amount, 10000);
  });
});

describe("savePdcChecks hard lock (Quarterly / Two-monthly dual-line)", () => {
  it("requires interest+principal dual rows on the same final due date (Quarterly)", async () => {
    const RELEASE_DATE = "2026-09-01";
    const expected = generateQuarterlySchedule({
      terms: 6,
      totalLoan: 60000,
      totalInterest: 5000,
      releaseDate: new Date(RELEASE_DATE),
      dueDay: 10,
    });

    const stub = makeSavePdcStub({
      terms: 6,
      monthlyAmortization: 0,
      paymentFrequency: "quarterly",
      releaseDate: RELEASE_DATE,
      totalLoan: 60000,
      totalInterest: 5000,
      dueDay: 10,
    });

    const checks = expected.map((row, i) => ({
      checkNumber: String(1001 + i),
      amount: row.amountDue,
      checkDate: row.dueDate,
      bankName: "Test Bank",
    }));

    const result = await savePdcChecks(stub.supabase, "rf-1", checks, undefined, "actor-1");
    assert.equal(result.status, "ready_generate");
    const inserted = stub.getInsertedChecks() as Array<{ amount: number; check_date: string }>;
    assert.equal(inserted.length, 4); // 2 quarters × 2 lines
    assert.equal(inserted[0].check_date, inserted[1].check_date); // same due date
    assert.equal(inserted[0].amount, 2500); // interest
    assert.equal(inserted[1].amount, 27500); // principal
  });

  it("requires the correct dual-line schedule for Two-monthly", async () => {
    const RELEASE_DATE = "2026-09-01";
    const expected = generateTwoMonthlySchedule({
      terms: 4,
      totalLoan: 40000,
      totalInterest: 2000,
      releaseDate: new Date(RELEASE_DATE),
      dueDay: 10,
    });

    const stub = makeSavePdcStub({
      terms: 4,
      monthlyAmortization: 0,
      paymentFrequency: "two_monthly",
      releaseDate: RELEASE_DATE,
      totalLoan: 40000,
      totalInterest: 2000,
      dueDay: 10,
    });

    const checks = expected.map((row, i) => ({
      checkNumber: String(1001 + i),
      amount: row.amountDue,
      checkDate: row.dueDate,
      bankName: "Test Bank",
    }));

    const result = await savePdcChecks(stub.supabase, "rf-1", checks, undefined, "actor-1");
    assert.equal(result.status, "ready_generate");
    const inserted = stub.getInsertedChecks() as Array<{ amount: number }>;
    assert.equal(inserted.length, 4); // 2 payments × 2 lines
    assert.equal(inserted[0].amount, 1000); // interest
    assert.equal(inserted[1].amount, 19000); // principal
  });
});

/**
 * Regression coverage for a live bug (application AN300445, 2026-09-04):
 * quarterly_special/two_monthly_special's generator emits a $0 principal
 * row alongside every non-final period's interest row (kept that way so
 * discount-units.ts's pairing stride stays intact — see
 * docs/quarterly-bimonthly-special-schedule-implementation-plan.md). Before
 * this fix, buildExpectedPdcSchedule mapped those raw rows straight into the
 * expected-PDC-checks list, so LRA demanded a real staff physically write a
 * ₱0 postdated check for every non-final period — nonsensical, and it
 * silently doubled the real check count. The fix filters to amountDue > 0
 * before building the expected schedule; these tests assert only the real
 * (interest-only, then final interest+principal) checks are ever expected.
 */
describe("savePdcChecks hard lock (Quarterly / Two-monthly SPECIAL — no $0 checks)", () => {
  it("Quarterly Special: N interest-only checks + 1 final principal check, never a $0 row", async () => {
    const RELEASE_DATE = "2026-09-04";
    // Mirrors AN300445's real numbers: principal 168300, terms 12 (÷3 = 4
    // quarters), gross total interest 70686.
    const expected = generateQuarterlySpecialSchedule({
      terms: 12,
      totalLoan: 238986,
      totalInterest: 70686,
      releaseDate: new Date(RELEASE_DATE),
      dueDay: 10,
    });
    // Sanity: the raw generator still contains $0 principal rows for the
    // first 3 quarters — that's the shape this test's fix has to filter.
    assert.equal(expected.length, 8); // 4 quarters × 2 lines
    assert.equal(expected.filter((r) => r.amountDue === 0).length, 3);

    const stub = makeSavePdcStub({
      terms: 12,
      monthlyAmortization: 0,
      paymentFrequency: "quarterly_special",
      releaseDate: RELEASE_DATE,
      totalLoan: 238986,
      totalInterest: 70686,
      dueDay: 10,
    });

    const realRows = expected.filter((row) => row.amountDue > 0);
    const checks = realRows.map((row, i) => ({
      checkNumber: String(1001 + i),
      amount: row.amountDue,
      checkDate: row.dueDate,
      bankName: "Test Bank",
    }));

    const result = await savePdcChecks(stub.supabase, "rf-1", checks, undefined, "actor-1");
    assert.equal(result.status, "ready_generate");
    const inserted = stub.getInsertedChecks() as Array<{ amount: number }>;
    assert.equal(inserted.length, 5); // 4 interest checks + 1 final principal check
    assert.ok(inserted.every((c) => c.amount > 0), "no $0 check should ever be expected");
    assert.equal(inserted[0].amount, 17671.5); // 70686 / 4
    assert.equal(inserted[4].amount, 168300); // final principal
  });

  it("Two-monthly Special: rejects a submission that still includes the raw $0 rows", async () => {
    const RELEASE_DATE = "2026-09-04";
    // Exact AN300445 case: principal 168300, terms 12 (÷2 = 6 payments),
    // gross total interest 70686 -> 11781/payment (the live error's amount).
    const expected = generateTwoMonthlySpecialSchedule({
      terms: 12,
      totalLoan: 238986,
      totalInterest: 70686,
      releaseDate: new Date(RELEASE_DATE),
      dueDay: 10,
    });
    assert.equal(expected.length, 12); // 6 payments × 2 lines
    assert.equal(expected[0].amountDue, 11781); // matches the live error message

    const stub = makeSavePdcStub({
      terms: 12,
      monthlyAmortization: 0,
      paymentFrequency: "two_monthly_special",
      releaseDate: RELEASE_DATE,
      totalLoan: 238986,
      totalInterest: 70686,
      dueDay: 10,
    });

    // Submitting all 12 raw rows (the pre-fix expectation) must now be
    // rejected as the wrong count — 7 is correct (6 interest + 1 principal).
    const rawChecks = expected.map((row, i) => ({
      checkNumber: String(1001 + i),
      amount: row.amountDue,
      checkDate: row.dueDate,
      bankName: "Test Bank",
    }));
    await assert.rejects(
      () => savePdcChecks(stub.supabase, "rf-1", rawChecks, undefined, "actor-1"),
      /Number of checks must equal 7/,
    );

    // The correct, filtered submission succeeds.
    const realRows = expected.filter((row) => row.amountDue > 0);
    const goodChecks = realRows.map((row, i) => ({
      checkNumber: String(1001 + i),
      amount: row.amountDue,
      checkDate: row.dueDate,
      bankName: "Test Bank",
    }));
    const result = await savePdcChecks(stub.supabase, "rf-1", goodChecks, undefined, "actor-1");
    assert.equal(result.status, "ready_generate");
    const inserted = stub.getInsertedChecks() as Array<{ amount: number }>;
    assert.equal(inserted.length, 7); // 6 interest checks + 1 final principal check
    assert.ok(inserted.every((c) => c.amount > 0), "no $0 check should ever be expected");
  });
});

/**
 * Regression coverage for F10 (see
 * docs/ledger-balance-consistency-fix-implementation-plan.md Phase 1): PDC
 * amounts must be built from the computation's GROSS interest
 * (principal + gross_total_interest), never the already-net total_interest/
 * monthly_amortization a discount leaves behind — otherwise a discounted
 * loan's checks disagree with what initializeArAccount actually bills at
 * release. Each case below sets gross_total_interest higher than the net
 * total_interest a discount would have left, and asserts the accepted check
 * amount reflects the GROSS figure, not the net one — a regression to the
 * pre-fix behavior would compute the smaller, net-basis amount instead and
 * these tests would reject the (correct) gross amount.
 */
describe("savePdcChecks gross-basis PDC parity (F10)", () => {
  it("flat monthly cadence uses gross basis, not net total_interest", async () => {
    // principal 100000, terms 4: gross interest 8000 -> gross total 108000 ->
    // 27000/mo. A discount left the stored (net) total_interest at only
    // 5000 -> 105000/26250 would be the pre-fix (wrong) answer.
    const stub = makeSavePdcStub({
      terms: 4,
      monthlyAmortization: 26250, // net-basis value a pre-fix caller would expect
      paymentFrequency: "monthly",
      totalInterest: 5000,
      grossTotalInterest: 8000,
      principal: 100000,
      totalLoan: 105000,
    });

    const checks = makeChecks(4, 27000);
    const result = await savePdcChecks(
      stub.supabase,
      "rf-1",
      checks,
      undefined,
      "actor-1",
    );
    assert.equal(result.status, "ready_generate");
    const inserted = stub.getInsertedChecks() as Array<{ amount: number }>;
    assert.equal(inserted.length, 4);
    for (const row of inserted) {
      assert.equal(row.amount, 27000);
    }

    // The pre-fix net-basis amount must now be rejected.
    await assert.rejects(
      () =>
        savePdcChecks(
          stub.supabase,
          "rf-1",
          makeChecks(4, 26250),
          undefined,
          "actor-1",
        ),
      /Check amount must equal the monthly amortization \(₱27000\)/,
    );
  });

  it("semi-monthly (Salary) cadence uses gross basis, not net total_interest", async () => {
    // principal 120000, terms 6: gross interest 12000 -> gross total 132000
    // -> monthly 22000 -> half 11000. Net (discounted) total_interest 6000
    // would have given monthly 21000 / half 10500 pre-fix.
    const stub = makeSavePdcStub({
      terms: 6,
      monthlyAmortization: 21000, // net-basis value a pre-fix caller would expect
      paymentFrequency: "semi_monthly",
      totalInterest: 6000,
      grossTotalInterest: 12000,
      principal: 120000,
      totalLoan: 126000,
      firstPaymentDate: "2026-08-31",
    });

    const half = 11000;
    const checks = Array.from({ length: 12 }, (_, i) => ({
      checkNumber: String(3001 + i),
      amount: i === 11 ? halfUp(132000 - halfUp(half * 11)) : half,
      checkDate: advanceSemiMonthly("2026-08-31", i),
      bankName: "Test Bank",
    }));

    const result = await savePdcChecks(
      stub.supabase,
      "rf-1",
      checks,
      undefined,
      "actor-1",
    );
    assert.equal(result.status, "ready_generate");
    const inserted = stub.getInsertedChecks() as Array<{ amount: number }>;
    assert.equal(inserted.length, 12);
    assert.equal(inserted[0].amount, 11000);
  });

  it("quarterly cadence uses gross basis, not net total_interest", async () => {
    // Gross totalInterest 9000 (vs. net-discounted totalInterest 5000 the
    // computation actually stores) must drive the interest/principal split.
    const RELEASE_DATE = "2026-09-01";
    const grossTotalLoan = 100000 + 9000; // principal + gross interest
    const expected = generateQuarterlySchedule({
      terms: 6,
      totalLoan: grossTotalLoan,
      totalInterest: 9000,
      releaseDate: new Date(RELEASE_DATE),
      dueDay: 10,
    });

    const stub = makeSavePdcStub({
      terms: 6,
      monthlyAmortization: 0,
      paymentFrequency: "quarterly",
      releaseDate: RELEASE_DATE,
      totalInterest: 5000, // net, discounted — must NOT be what PDC uses
      grossTotalInterest: 9000,
      principal: 100000,
      totalLoan: 105000, // net total_loan on the computation row
      dueDay: 10,
    });

    const checks = expected.map((row, i) => ({
      checkNumber: String(4001 + i),
      amount: row.amountDue,
      checkDate: row.dueDate,
      bankName: "Test Bank",
    }));

    const result = await savePdcChecks(stub.supabase, "rf-1", checks, undefined, "actor-1");
    assert.equal(result.status, "ready_generate");
    const inserted = stub.getInsertedChecks() as Array<{ amount: number }>;
    assert.equal(inserted.length, 4); // 2 quarters × 2 lines
    assert.equal(inserted[0].amount, expected[0].amountDue); // gross interest, 4500
    assert.equal(inserted[1].amount, expected[1].amountDue); // gross principal

    // The net-basis (discounted) amounts must now be rejected.
    const netExpected = generateQuarterlySchedule({
      terms: 6,
      totalLoan: 105000,
      totalInterest: 5000,
      releaseDate: new Date(RELEASE_DATE),
      dueDay: 10,
    });
    const netChecks = netExpected.map((row, i) => ({
      checkNumber: String(4001 + i),
      amount: row.amountDue,
      checkDate: row.dueDate,
      bankName: "Test Bank",
    }));
    await assert.rejects(() =>
      savePdcChecks(stub.supabase, "rf-1", netChecks, undefined, "actor-1"),
    );
  });
});
