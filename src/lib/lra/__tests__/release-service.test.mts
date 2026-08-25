import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { addScheduleMonths, advanceSemiMonthly } from "@/lib/computation/release-date";
import { halfUp } from "@/lib/computation/money";

import { savePdcChecks } from "../release-service";

type StubOpts = {
  terms: number;
  monthlyAmortization: number;
  releasePath?: string;
  firstPaymentDate?: string | null;
  paymentFrequency?: "monthly" | "semi_monthly";
  totalLoan?: number;
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
    principal: 100000,
    processing_fee: 0,
    admin_cost: 0,
    doc_stamp: 0,
    notary_fee: 0,
    security_fee: 0,
    other_deductions_total: 0,
    total_deductions: 0,
    net_released: 100000,
    total_interest: 0,
    total_loan: opts.totalLoan ?? 100000,
    release_date: null,
    first_payment_date:
      opts.firstPaymentDate === undefined
        ? FIRST_PAYMENT_DATE
        : opts.firstPaymentDate,
    due_day: null,
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
