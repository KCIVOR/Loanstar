import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { savePdcChecks } from "../release-service";

type StubOpts = {
  terms: number;
  monthlyAmortization: number;
  releasePath?: string;
};

function makeCheckRow(amount: number, index = 0) {
  return {
    checkNumber: index === 0 ? "1001" : null,
    amount,
    checkDate: "2026-08-12",
    bankName: "Test Bank",
  };
}

function makeChecks(count: number, amount: number) {
  return Array.from({ length: count }, (_, i) => makeCheckRow(amount, i));
}

function makeSavePdcStub(opts: StubOpts) {
  let insertedChecks: unknown[] | null = null;
  let releaseFileUpdated: Record<string, unknown> | null = null;

  const releaseFileRow = {
    id: "rf-1",
    loan_application_id: "app-1",
    computation_id: "comp-1",
    release_path: opts.releasePath ?? "with_pdc",
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
    total_loan: 100000,
    release_date: null,
    first_payment_date: null,
    due_day: null,
    line_items: [],
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
});
