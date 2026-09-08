import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { netInstallmentDue } from "../../computation/money";
import {
  addPaymentToDcr,
  computeAutoAllocation,
  isAccountFullySettled,
  reconcileAndPostDcr,
  recomputeOutstandingBalance,
  submitDcr,
  writeOffAccountRoundingDifference,
  writeOffRoundingDifference,
  type AllocationLine,
  type OpenInstallment,
} from "../posting";

/** In-memory PostgREST stub for the Task-4 duplicate loaders — same shape as
 * the one in duplicate-dcr.test.mts. */
function makeLoaderStub(
  tables: Record<string, Array<Record<string, unknown>>>,
) {
  function builder(rows: Array<Record<string, unknown>>) {
    let filtered = rows;
    const b = {
      select: () => b,
      eq: (col: string, val: unknown) => {
        filtered = filtered.filter((r) => r[col] === val);
        return b;
      },
      neq: (col: string, val: unknown) => {
        filtered = filtered.filter((r) => r[col] !== val);
        return b;
      },
      in: (col: string, vals: unknown[]) => {
        filtered = filtered.filter((r) => vals.includes(r[col]));
        return b;
      },
      not: (col: string, _op: string, val: unknown) => {
        filtered = filtered.filter((r) => r[col] !== val);
        return b;
      },
      order: () => b,
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: filtered, error: null }),
    };
    return b;
  }
  return { from: (t: string) => builder(tables[t] ?? []) } as never;
}

function inst(
  overrides: Partial<OpenInstallment> & Pick<OpenInstallment, "id" | "installmentNo">,
): OpenInstallment {
  return {
    amountDue: 1000,
    penaltyAmount: 0,
    amountPaid: 0,
    status: "pending",
    ...overrides,
  };
}

function thenable<T>(value: T) {
  const chain: Record<string, unknown> = {};
  for (const method of [
    "select",
    "eq",
    "in",
    "not",
    "order",
    "update",
    "insert",
    "single",
  ]) {
    chain[method] = (..._args: unknown[]) => {
      if (method === "single") {
        return Promise.resolve(value);
      }
      if (method === "insert") {
        return {
          select: () => ({
            single: () => Promise.resolve(value),
          }),
        };
      }
      return chain;
    };
  }
  chain.then = (resolve: (v: T) => void) => {
    resolve(value);
    return Promise.resolve(value);
  };
  return chain;
}

/**
 * Regression coverage for Phase 3 (see
 * docs/ledger-balance-consistency-fix-implementation-plan.md) —
 * `recomputeOutstandingBalance` is the foundation every balance-mutating
 * path will be wired to in Phase 4. It must derive the balance fresh from
 * the rows (net of discount, plus penalty, minus amount_paid, per row,
 * floored at 0, excluding paid/rolled rows) rather than trust any stored
 * accumulator — these tests exercise exactly the scenarios that broke the
 * old accumulate-in-place logic (discount, penalty, a mix of open statuses).
 */
describe("recomputeOutstandingBalance", () => {
  function stubRows(rows: Array<Record<string, unknown>>) {
    return {
      from(table: string) {
        assert.equal(table, "amortization_schedules");
        return {
          select: () => ({
            eq: () => ({
              not: () => Promise.resolve({ data: rows, error: null }),
            }),
          }),
        };
      },
    } as never;
  }

  it("returns 0 when every row is paid or rolled (excluded from the sum)", async () => {
    const supabase = stubRows([]);
    const balance = await recomputeOutstandingBalance(supabase, "ml-1");
    assert.equal(balance, 0);
  });

  it("sums net-still-owed across a mix of pending/partial/overdue rows", async () => {
    const supabase = stubRows([
      { amount_due: 1000, discount_amount: 0, penalty_amount: 0, amount_paid: 0, status: "pending" },
      { amount_due: 1000, discount_amount: 0, penalty_amount: 0, amount_paid: 400, status: "partial" },
      { amount_due: 1000, discount_amount: 0, penalty_amount: 50, amount_paid: 0, status: "overdue" },
    ]);
    const balance = await recomputeOutstandingBalance(supabase, "ml-1");
    // 1000 + 600 + 1050 = 2650
    assert.equal(balance, 2650);
  });

  it("credits discount and adds penalty on the same row", async () => {
    const supabase = stubRows([
      { amount_due: 2000, discount_amount: 500, penalty_amount: 100, amount_paid: 0, status: "overdue" },
    ]);
    const balance = await recomputeOutstandingBalance(supabase, "ml-1");
    // 2000 - 500 + 100 = 1600
    assert.equal(balance, 1600);
  });

  it("excludes paid and rolled rows even if they were included in the query result", async () => {
    // The real query filters these out server-side; this proves the client
    // code doesn't accidentally re-include them if the filter were ever
    // loosened — floors at 0, never goes negative from an overpaid row.
    const supabase = stubRows([
      { amount_due: 1000, discount_amount: 0, penalty_amount: 0, amount_paid: 1000, status: "pending" },
    ]);
    const balance = await recomputeOutstandingBalance(supabase, "ml-1");
    assert.equal(balance, 0);
  });

  it("never returns negative even if amount_paid exceeds amount_due", async () => {
    const supabase = stubRows([
      { amount_due: 1000, discount_amount: 0, penalty_amount: 0, amount_paid: 1200, status: "pending" },
    ]);
    const balance = await recomputeOutstandingBalance(supabase, "ml-1");
    assert.equal(balance, 0);
  });

  it("excludes 'moved' rows from the query, not just 'paid'/'rolled' (Fixes Plan Phase 1, Issue 1)", async () => {
    // A Move of Payment defers the obligation onto an appended extension
    // row; counting the moved row too double-counts one installment.
    let notArgs: unknown[] = [];
    const supabase = {
      from(table: string) {
        assert.equal(table, "amortization_schedules");
        return {
          select: () => ({
            eq: () => ({
              not: (...args: unknown[]) => {
                notArgs = args;
                return Promise.resolve({ data: [], error: null });
              },
            }),
          }),
        };
      },
    } as never;

    await recomputeOutstandingBalance(supabase, "ml-1");
    assert.deepEqual(notArgs, ["status", "in", "(paid,rolled,moved)"]);
  });
});

/**
 * Regression coverage for Phase 6 / F8 (see
 * docs/ledger-balance-consistency-fix-implementation-plan.md) —
 * `isAccountFullySettled` is the row-level half of "is this account
 * actually done?" A derived balance of 0 is NOT sufficient on its own: a
 * row can net to 0 (e.g. a legacy fully-discounted row never transitioned
 * to 'paid', or a penalty exactly offsetting an over-credit) while still
 * sitting open.
 */
describe("isAccountFullySettled", () => {
  function stubOpenIds(ids: string[]) {
    return {
      from(table: string) {
        assert.equal(table, "amortization_schedules");
        return {
          select: () => ({
            eq: () => ({
              not: () => ({
                limit: () =>
                  Promise.resolve({
                    data: ids.map((id) => ({ id })),
                    error: null,
                  }),
              }),
            }),
          }),
        };
      },
    } as never;
  }

  it("is true when no row is open (every row paid/rolled)", async () => {
    const settled = await isAccountFullySettled(stubOpenIds([]), "ml-1");
    assert.equal(settled, true);
  });

  it("is false when at least one row is still open, regardless of what it nets to", async () => {
    const settled = await isAccountFullySettled(stubOpenIds(["s1"]), "ml-1");
    assert.equal(settled, false);
  });
});

describe("computeAutoAllocation", () => {
  it("fills a single installment exactly", () => {
    const lines = computeAutoAllocation(1000, [
      inst({ id: "s1", installmentNo: 1, amountDue: 1000 }),
    ]);
    assert.deepEqual(lines, [
      { amortizationScheduleId: "s1", amount: 1000 },
    ]);
  });

  it("spans multiple installments in order", () => {
    const lines = computeAutoAllocation(2500, [
      inst({ id: "s1", installmentNo: 1, amountDue: 1000 }),
      inst({ id: "s2", installmentNo: 2, amountDue: 1500 }),
      inst({ id: "s3", installmentNo: 3, amountDue: 1000 }),
    ]);
    assert.deepEqual(lines, [
      { amortizationScheduleId: "s1", amount: 1000 },
      { amortizationScheduleId: "s2", amount: 1500 },
    ]);
  });

  it("appends a trailing advance line for leftover", () => {
    const lines = computeAutoAllocation(5000, [
      inst({ id: "s1", installmentNo: 1, amountDue: 1000 }),
      inst({ id: "s2", installmentNo: 2, amountDue: 1000 }),
    ]);
    assert.deepEqual(lines, [
      { amortizationScheduleId: "s1", amount: 1000 },
      { amortizationScheduleId: "s2", amount: 1000 },
      { amortizationScheduleId: null, amount: 3000 },
    ]);
  });

  it("skips installments with no remaining due (pre-filtered paid rows)", () => {
    const lines = computeAutoAllocation(1000, [
      inst({
        id: "s-paid",
        installmentNo: 1,
        amountDue: 1000,
        amountPaid: 1000,
        status: "partial",
      }),
      inst({ id: "s-open", installmentNo: 2, amountDue: 1000 }),
    ]);
    assert.deepEqual(lines, [
      { amortizationScheduleId: "s-open", amount: 1000 },
    ]);
  });

  it("produces one partial line and no advance when under one installment", () => {
    const lines = computeAutoAllocation(500, [
      inst({ id: "s1", installmentNo: 1, amountDue: 1000 }),
    ]);
    assert.deepEqual(lines, [
      { amortizationScheduleId: "s1", amount: 500 },
    ]);
  });

  it("skips a fully-discounted installment (nothing really owed) and flows the payment to the next real installment (2026-08-31)", () => {
    const lines = computeAutoAllocation(1000, [
      inst({
        id: "s-discounted",
        installmentNo: 1,
        amountDue: 1080,
        discountAmount: 1080, // 100% off — real amount owed is ₱0
      }),
      inst({ id: "s2", installmentNo: 2, amountDue: 1000 }),
    ]);
    assert.deepEqual(lines, [{ amortizationScheduleId: "s2", amount: 1000 }]);
  });

  it("allocates only the net (discounted) amount to a partially-discounted installment", () => {
    const lines = computeAutoAllocation(1160, [
      inst({
        id: "s1",
        installmentNo: 1,
        amountDue: 2160,
        discountAmount: 1000, // real amount owed is 1160
      }),
    ]);
    assert.deepEqual(lines, [{ amortizationScheduleId: "s1", amount: 1160 }]);
  });
});

describe("addPaymentToDcr", () => {
  type AddStubOpts = {
    paymentAmount?: number;
    masterlistId?: string;
    schedules?: Array<{
      id: string;
      masterlist_id: string;
      status: string;
      installment_no: number;
      amount_due: number;
      penalty_amount: number;
      amount_paid: number;
    }>;
  };

  function makeAddStub(opts: AddStubOpts = {}) {
    const paymentAmount = opts.paymentAmount ?? 1000;
    const masterlistId = opts.masterlistId ?? "ml-1";
    const schedules =
      opts.schedules ??
      [
        {
          id: "s1",
          masterlist_id: masterlistId,
          status: "pending",
          installment_no: 1,
          amount_due: 1000,
          penalty_amount: 0,
          amount_paid: 0,
        },
      ];

    let insertedAllocations: AllocationLine[] | null = null;

    const supabase = {
      from(table: string) {
        if (table === "dcr") {
          return thenable({
            data: {
              id: "dcr-1",
              status: "draft",
              collector_user_id: "collector-1",
            },
            error: null,
          });
        }

        if (table === "payments") {
          return thenable({
            data: {
              id: "pay-1",
              amount: paymentAmount,
              status: "confirmed",
              masterlist_id: masterlistId,
            },
            error: null,
          });
        }

        if (table === "dcr_items") {
          return {
            select: () => ({
              eq: async () => ({ data: [], error: null }),
            }),
            insert: (payload: unknown) => ({
              select: () => ({
                single: async () => ({
                  data: { id: "item-1", ...(payload as object) },
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "amortization_schedules") {
          return {
            select: () => ({
              eq: () => ({
                in: () => ({
                  order: async () => ({
                    data: schedules,
                    error: null,
                  }),
                }),
              }),
              in: async (_col: string, ids: string[]) => ({
                data: schedules.filter((row) => ids.includes(row.id)),
                error: null,
              }),
            }),
          };
        }

        if (table === "dcr_item_allocations") {
          return {
            insert: async (rows: AllocationLine[] | Array<Record<string, unknown>>) => {
              insertedAllocations = (rows as Array<Record<string, unknown>>).map(
                (row) => ({
                  amortizationScheduleId: row.amortization_schedule_id as
                    | string
                    | null,
                  amount: Number(row.amount),
                }),
              );
              return { error: null };
            },
          };
        }

        throw new Error(`unexpected table ${table}`);
      },
    };

    return {
      supabase: supabase as never,
      getInsertedAllocations: () => insertedAllocations,
    };
  }

  /**
   * Service-role stub for the Task-4 amount-aware duplicate lookup (Option 1).
   * `pendingBySchedule` = peso already allocated per installment by a `pending`
   * item on ANOTHER unposted DCRR for this account; the loaders
   * (`loadPendingAllocationsForAccount`) read it back through `makeLoaderStub`.
   * Empty → nothing pending elsewhere.
   */
  function makeDupServiceStub(
    pendingBySchedule: Record<string, number> = {},
    masterlistId = "ml-1",
  ) {
    return makeLoaderStub({
      payments: [{ id: "opay-1", masterlist_id: masterlistId }],
      dcr_items: [
        {
          id: "oitem-1",
          dcr_id: "other-dcr",
          payment_id: "opay-1",
          status: "pending",
        },
      ],
      dcr: [{ id: "other-dcr", status: "submitted" }],
      dcr_item_allocations: Object.entries(pendingBySchedule).map(
        ([sid, amount]) => ({
          amortization_schedule_id: sid,
          amount,
          dcr_item_id: "oitem-1",
        }),
      ),
    });
  }

  it("rejects a Collector-supplied allocation whose total does not match", async () => {
    const { supabase } = makeAddStub({ paymentAmount: 1000 });
    await assert.rejects(
      () =>
        addPaymentToDcr(supabase, "dcr-1", "pay-1", "collector-1", [
          { amortizationScheduleId: "s1", amount: 900 },
        ]),
      /does not match the payment amount/,
    );
  });

  it("rejects an allocation targeting a rolled installment", async () => {
    const { supabase } = makeAddStub({
      schedules: [
        {
          id: "s-rolled",
          masterlist_id: "ml-1",
          status: "rolled",
          installment_no: 1,
          amount_due: 1000,
          penalty_amount: 0,
          amount_paid: 0,
        },
      ],
    });
    await assert.rejects(
      () =>
        addPaymentToDcr(supabase, "dcr-1", "pay-1", "collector-1", [
          { amortizationScheduleId: "s-rolled", amount: 1000 },
        ]),
      /not available for allocation/,
    );
  });

  it("rejects an allocation targeting a foreign masterlist installment", async () => {
    const { supabase } = makeAddStub({
      masterlistId: "ml-1",
      schedules: [
        {
          id: "s-foreign",
          masterlist_id: "ml-other",
          status: "pending",
          installment_no: 1,
          amount_due: 1000,
          penalty_amount: 0,
          amount_paid: 0,
        },
      ],
    });
    await assert.rejects(
      () =>
        addPaymentToDcr(supabase, "dcr-1", "pay-1", "collector-1", [
          { amortizationScheduleId: "s-foreign", amount: 1000 },
        ]),
      /does not belong to this loan account/,
    );
  });

  it("falls back to the automatic breakdown when no allocation is supplied", async () => {
    const { supabase, getInsertedAllocations } = makeAddStub({
      paymentAmount: 2500,
      schedules: [
        {
          id: "s1",
          masterlist_id: "ml-1",
          status: "pending",
          installment_no: 1,
          amount_due: 1000,
          penalty_amount: 0,
          amount_paid: 0,
        },
        {
          id: "s2",
          masterlist_id: "ml-1",
          status: "pending",
          installment_no: 2,
          amount_due: 1500,
          penalty_amount: 0,
          amount_paid: 0,
        },
      ],
    });

    await addPaymentToDcr(
      supabase,
      "dcr-1",
      "pay-1",
      "collector-1",
      undefined,
      undefined,
      makeDupServiceStub(),
    );

    const expected = computeAutoAllocation(2500, [
      inst({ id: "s1", installmentNo: 1, amountDue: 1000 }),
      inst({ id: "s2", installmentNo: 2, amountDue: 1500 }),
    ]);
    assert.deepEqual(getInsertedAllocations(), expected);
  });

  it("Task 4 — blocks when the new allocation would OVER-fill an installment another unposted DCRR already covers", async () => {
    const { supabase } = makeAddStub({
      paymentAmount: 1000,
      schedules: [
        {
          id: "s1",
          masterlist_id: "ml-1",
          status: "pending",
          installment_no: 1,
          amount_due: 1000,
          penalty_amount: 0,
          amount_paid: 0,
        },
      ],
    });
    await assert.rejects(
      () =>
        addPaymentToDcr(
          supabase,
          "dcr-1",
          "pay-1",
          "collector-1",
          [{ amortizationScheduleId: "s1", amount: 1000 }],
          undefined,
          // s1 owes 1000 and another unposted DCRR already holds the full 1000
          makeDupServiceStub({ s1: 1000 }),
        ),
      /over-fill an installment that another\s+unposted DCRR/,
    );
  });

  it("Task 4 — allows a partial fill up to the amount still free on a partly-claimed installment", async () => {
    const { supabase, getInsertedAllocations } = makeAddStub({
      paymentAmount: 3668,
      schedules: [
        {
          id: "s1",
          masterlist_id: "ml-1",
          status: "pending",
          installment_no: 1,
          amount_due: 18900,
          penalty_amount: 0,
          amount_paid: 0,
        },
      ],
    });
    await addPaymentToDcr(
      supabase,
      "dcr-1",
      "pay-1",
      "collector-1",
      [{ amortizationScheduleId: "s1", amount: 3668 }],
      undefined,
      // 15232 already pending elsewhere + 3668 new = 18900 = exactly the due
      makeDupServiceStub({ s1: 15232 }),
    );
    assert.deepEqual(getInsertedAllocations(), [
      { amortizationScheduleId: "s1", amount: 3668 },
    ]);
  });

  it("Task 4 — allows when nothing is pending elsewhere on the installment", async () => {
    const { supabase, getInsertedAllocations } = makeAddStub({
      paymentAmount: 1000,
      schedules: [
        {
          id: "s1",
          masterlist_id: "ml-1",
          status: "pending",
          installment_no: 1,
          amount_due: 1000,
          penalty_amount: 0,
          amount_paid: 0,
        },
      ],
    });
    await addPaymentToDcr(
      supabase,
      "dcr-1",
      "pay-1",
      "collector-1",
      [{ amortizationScheduleId: "s1", amount: 1000 }],
      undefined,
      makeDupServiceStub({}), // lookup returns nothing → no conflict
    );
    assert.deepEqual(getInsertedAllocations(), [
      { amortizationScheduleId: "s1", amount: 1000 },
    ]);
  });
});

describe("submitDcr — Task 4 duplicate backstop", () => {
  function submitOwnerStub() {
    return {
      from(table: string) {
        if (table === "dcr") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: "dcr-1",
                    status: "draft",
                    collector_user_id: "collector-1",
                  },
                  error: null,
                }),
              }),
            }),
            update: () => ({ eq: async () => ({ error: null }) }),
          };
        }
        if (table === "dcr_items") {
          return {
            select: () => ({
              eq: async () => ({ count: 1, data: [], error: null }),
            }),
          };
        }
        if (table === "payments") {
          return {
            update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as never;
  }

  it("blocks submit when the DCRR would OVER-fill an installment another unposted DCRR already covers", async () => {
    const service = makeLoaderStub({
      dcr_items: [
        { id: "it-own", dcr_id: "dcr-1", payment_id: "pay-own", status: "pending" },
        { id: "it-other", dcr_id: "dcr-2", payment_id: "pay-other", status: "pending" },
      ],
      payments: [
        { id: "pay-own", masterlist_id: "ml-1" },
        { id: "pay-other", masterlist_id: "ml-1" },
      ],
      dcr_item_allocations: [
        { amortization_schedule_id: "s1", amount: 1000, dcr_item_id: "it-own" },
        { amortization_schedule_id: "s1", amount: 1000, dcr_item_id: "it-other" },
      ],
      dcr: [
        { id: "dcr-1", status: "draft" },
        { id: "dcr-2", status: "draft" },
      ],
      amortization_schedules: [
        {
          id: "s1",
          masterlist_id: "ml-1",
          installment_no: 1,
          amount_due: 1000,
          penalty_amount: 0,
          discount_amount: 0,
          amount_paid: 0,
          status: "pending",
        },
      ],
    });
    await assert.rejects(
      () => submitDcr(submitOwnerStub(), "dcr-1", "collector-1", service),
      /over-fill an installment that another unposted DCRR/,
    );
  });

  it("submits cleanly when another DCRR shares the installment but the total still fits", async () => {
    const service = makeLoaderStub({
      dcr_items: [
        { id: "it-own", dcr_id: "dcr-1", payment_id: "pay-own", status: "pending" },
        { id: "it-other", dcr_id: "dcr-2", payment_id: "pay-other", status: "pending" },
      ],
      payments: [
        { id: "pay-own", masterlist_id: "ml-1" },
        { id: "pay-other", masterlist_id: "ml-1" },
      ],
      dcr_item_allocations: [
        { amortization_schedule_id: "s1", amount: 400, dcr_item_id: "it-own" },
        { amortization_schedule_id: "s1", amount: 600, dcr_item_id: "it-other" },
      ],
      dcr: [
        { id: "dcr-1", status: "draft" },
        { id: "dcr-2", status: "draft" },
      ],
      amortization_schedules: [
        {
          id: "s1",
          masterlist_id: "ml-1",
          installment_no: 1,
          amount_due: 1000,
          penalty_amount: 0,
          discount_amount: 0,
          amount_paid: 0,
          status: "pending",
        },
      ],
    });
    const result = await submitDcr(
      submitOwnerStub(),
      "dcr-1",
      "collector-1",
      service,
    );
    assert.equal(result.status, "submitted");
  });
});

describe("reconcileAndPostDcr", () => {
  type ReconcileStubOpts = {
    storedAllocations?: Array<{
      amortization_schedule_id: string | null;
      amount: number;
    }>;
    openSchedules?: Array<{
      id: string;
      installment_no: number;
      amount_due: number;
      penalty_amount: number;
      amount_paid: number;
      status: string;
    }>;
    scheduleDetails?: Record<
      string,
      {
        amount_due: number;
        penalty_amount: number;
        amount_paid: number;
        status: string;
        discount_amount?: number;
      }
    >;
    /** Defaults to 2500 — override when a test's allocation total differs
     * (e.g. a fully-discounted installment allocated ₱0). */
    dcrItemAmount?: number;
  };

  function makeReconcileStub(opts: ReconcileStubOpts = {}) {
    const postings: Array<Record<string, unknown>> = [];
    const scheduleUpdates: Array<Record<string, unknown>> = [];
    const dcrItemAmount = opts.dcrItemAmount ?? 2500;

    const storedAllocations = opts.storedAllocations ?? [];
    const openSchedules =
      opts.openSchedules ??
      [
        {
          id: "s1",
          installment_no: 1,
          amount_due: 1000,
          penalty_amount: 0,
          amount_paid: 0,
          status: "pending",
        },
      ];
    const scheduleDetails = opts.scheduleDetails ?? {
      s1: {
        amount_due: 1000,
        penalty_amount: 0,
        amount_paid: 0,
        status: "pending",
      },
      s2: {
        amount_due: 1500,
        penalty_amount: 0,
        amount_paid: 0,
        status: "pending",
      },
    };

    const supabase = {
      from(table: string) {
        if (table === "dcr") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: "dcr-1",
                    status: "submitted",
                    collector_user_id: "collector-1",
                  },
                  error: null,
                }),
              }),
            }),
            update: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        }

        if (table === "dcr_items") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "item-1", payment_id: "pay-1", amount: dcrItemAmount }],
                error: null,
              }),
            }),
          };
        }

        if (table === "payments") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: "pay-1",
                    masterlist_id: "ml-1",
                    amount: 2500,
                    status: "confirmed",
                  },
                  error: null,
                }),
              }),
            }),
            update: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        }

        if (table === "dcr_item_allocations") {
          return {
            select: () => ({
              eq: async () => ({
                data: storedAllocations,
                error: null,
              }),
            }),
          };
        }

        if (table === "amortization_schedules") {
          return {
            select: () => ({
              eq: (_col: string, value: string) => {
                if (value === "ml-1") {
                  return {
                    in: () => ({
                      order: async () => ({
                        data: openSchedules,
                        error: null,
                      }),
                    }),
                    // recomputeOutstandingBalance's chain — reuses the same
                    // fixture as the open-installments query above; none of
                    // these tests assert the derived balance value, only
                    // postings/schedule updates.
                    not: async () => ({
                      data: openSchedules,
                      error: null,
                    }),
                  };
                }
                const detail = scheduleDetails[value];
                return {
                  single: async () => ({
                    data: detail
                      ? {
                          id: value,
                          ...detail,
                        }
                      : null,
                    error: null,
                  }),
                };
              },
            }),
            update: (payload: Record<string, unknown>) => ({
              eq: async (_col: string, id: string) => {
                scheduleUpdates.push({ id, ...payload });
                return { error: null };
              },
            }),
          };
        }

        if (table === "postings") {
          return {
            insert: async (payload: Record<string, unknown>) => {
              postings.push(payload);
              return { error: null };
            },
          };
        }

        if (table === "masterlist") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { outstanding_balance: 10000 },
                  error: null,
                }),
              }),
            }),
            update: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        }

        throw new Error(`unexpected table ${table}`);
      },
      // Simulates the atomic post_single_dcr_item Postgres function
      // (Phase 5, see docs/ledger-balance-consistency-fix-implementation-plan.md)
      // that postSingleDcrItem now calls instead of four sequential writes —
      // same logic, same scheduleDetails fixture, so the existing
      // postings/scheduleUpdates assertions below still hold.
      rpc: async (fn: string, params: Record<string, unknown>) => {
        assert.equal(fn, "post_single_dcr_item");
        const allocations = params.p_allocations as Array<{
          amortizationScheduleId: string | null;
          amount: number;
        }>;

        for (const line of allocations) {
          postings.push({
            dcr_id: params.p_dcr_id,
            payment_id: params.p_payment_id,
            amortization_schedule_id: line.amortizationScheduleId,
            amount: line.amount,
            posted_by: params.p_actor_id,
            posted_at: params.p_now,
          });

          if (line.amortizationScheduleId) {
            const detail = scheduleDetails[line.amortizationScheduleId];
            if (detail) {
              const totalDue = netInstallmentDue({
                amountDue: detail.amount_due,
                discountAmount: detail.discount_amount,
                penaltyAmount: detail.penalty_amount,
              });
              const newPaid = detail.amount_paid + line.amount;
              const paid = newPaid >= totalDue;
              scheduleUpdates.push({
                id: line.amortizationScheduleId,
                amount_paid: newPaid,
                status: paid ? "paid" : "partial",
                paid_at: paid ? params.p_now : null,
              });
            }
          }
        }

        return { data: { skipped: false, newBalance: 0 }, error: null };
      },
    };

    return {
      supabase: supabase as never,
      getPostings: () => postings,
      getScheduleUpdates: () => scheduleUpdates,
    };
  }

  it("creates one posting per stored allocation line", async () => {
    const { supabase, getPostings, getScheduleUpdates } = makeReconcileStub({
      storedAllocations: [
        { amortization_schedule_id: "s1", amount: 1000 },
        { amortization_schedule_id: "s2", amount: 1500 },
      ],
    });

    await reconcileAndPostDcr(supabase, "dcr-1", "ar-1", {
      depositReference: "DEP-1",
      depositAmount: 2500,
    });

    assert.equal(getPostings().length, 2);
    assert.deepEqual(
      getPostings().map((row) => ({
        amortization_schedule_id: row.amortization_schedule_id,
        amount: row.amount,
      })),
      [
        { amortization_schedule_id: "s1", amount: 1000 },
        { amortization_schedule_id: "s2", amount: 1500 },
      ],
    );
    assert.equal(getScheduleUpdates().length, 2);
    assert.equal(getScheduleUpdates()[0]?.status, "paid");
    assert.equal(getScheduleUpdates()[1]?.status, "paid");
  });

  it("falls back to computeAutoAllocation when no stored allocations exist", async () => {
    const { supabase, getPostings } = makeReconcileStub({
      storedAllocations: [],
      openSchedules: [
        {
          id: "s1",
          installment_no: 1,
          amount_due: 1000,
          penalty_amount: 0,
          amount_paid: 0,
          status: "pending",
        },
        {
          id: "s2",
          installment_no: 2,
          amount_due: 1500,
          penalty_amount: 0,
          amount_paid: 0,
          status: "pending",
        },
      ],
    });

    await reconcileAndPostDcr(supabase, "dcr-1", "ar-1", {
      depositReference: "DEP-1",
      depositAmount: 2500,
    });

    const expected = computeAutoAllocation(2500, [
      inst({ id: "s1", installmentNo: 1, amountDue: 1000 }),
      inst({ id: "s2", installmentNo: 2, amountDue: 1500 }),
    ]);

    assert.deepEqual(
      getPostings().map((row) => ({
        amortization_schedule_id: row.amortization_schedule_id,
        amount: row.amount,
      })),
      expected.map((line) => ({
        amortization_schedule_id: line.amortizationScheduleId,
        amount: line.amount,
      })),
    );
  });

  it("marks a fully-discounted installment 'paid' when the ₱0 net amount is allocated to it, not stuck at 'partial' against the gross total (critical fix, 2026-08-31)", async () => {
    const { supabase, getScheduleUpdates } = makeReconcileStub({
      dcrItemAmount: 0,
      storedAllocations: [{ amortization_schedule_id: "s1", amount: 0 }],
      scheduleDetails: {
        s1: {
          amount_due: 1080,
          penalty_amount: 0,
          amount_paid: 0,
          status: "pending",
          discount_amount: 1080,
        },
      },
    });

    await reconcileAndPostDcr(supabase, "dcr-1", "ar-1", {
      depositReference: "DEP-1",
      depositAmount: 0,
    });

    assert.equal(getScheduleUpdates().length, 1);
    assert.equal(getScheduleUpdates()[0]?.status, "paid");
  });

  it("marks a partially-discounted installment 'paid' once the net (not gross) amount is fully allocated", async () => {
    const { supabase, getScheduleUpdates } = makeReconcileStub({
      dcrItemAmount: 1160,
      storedAllocations: [{ amortization_schedule_id: "s1", amount: 1160 }],
      scheduleDetails: {
        s1: {
          amount_due: 2160,
          penalty_amount: 0,
          amount_paid: 0,
          status: "pending",
          discount_amount: 1000,
        },
      },
    });

    await reconcileAndPostDcr(supabase, "dcr-1", "ar-1", {
      depositReference: "DEP-1",
      depositAmount: 1160,
    });

    assert.equal(getScheduleUpdates()[0]?.status, "paid");
  });
});

/**
 * Regression coverage for Phase 5 (see
 * docs/ledger-balance-consistency-fix-implementation-plan.md) — the actual
 * write sequence (posting insert, schedule update, payment status, balance
 * recompute) now happens inside one atomic Postgres function
 * (post_single_dcr_item), called via a single `.rpc()`. Real transaction
 * rollback isn't something a mocked client can exercise, so these tests
 * cover what the TypeScript side is actually responsible for: calling the
 * RPC with the right shape exactly once, propagating its error rather than
 * swallowing it, and treating a `{ skipped: true }` response (the RPC's own
 * idempotency guard firing) as a clean no-op.
 */
describe("postSingleDcrItem atomic RPC call (Phase 5)", () => {
  function makeAtomicStub(opts: {
    rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  }) {
    let rpcCallCount = 0;
    const supabase = {
      from(table: string) {
        if (table === "dcr") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { id: "dcr-1", status: "submitted", collector_user_id: "collector-1" },
                  error: null,
                }),
              }),
            }),
            update: () => ({ eq: async () => ({ error: null }) }),
          };
        }
        if (table === "dcr_items") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "item-1", payment_id: "pay-1", amount: 2500 }],
                error: null,
              }),
            }),
          };
        }
        if (table === "payments") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { id: "pay-1", masterlist_id: "ml-1", amount: 2500, status: "confirmed" },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "dcr_item_allocations") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ amortization_schedule_id: "s1", amount: 2500 }],
                error: null,
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
      rpc: async (fn: string, params: Record<string, unknown>) => {
        rpcCallCount += 1;
        return opts.rpc(fn, params);
      },
    };
    return { supabase: supabase as never, getRpcCallCount: () => rpcCallCount };
  }

  it("calls post_single_dcr_item exactly once with the resolved allocation lines", async () => {
    const captured: { params: Record<string, unknown> | null } = { params: null };
    const { supabase, getRpcCallCount } = makeAtomicStub({
      rpc: async (fn, params) => {
        captured.params = params;
        return { data: { skipped: false, newBalance: 0 }, error: null };
      },
    });

    await reconcileAndPostDcr(supabase, "dcr-1", "ar-1", {
      depositReference: "DEP-1",
      depositAmount: 2500,
    });

    assert.equal(getRpcCallCount(), 1);
    assert.ok(captured.params);
    assert.equal(captured.params.p_dcr_id, "dcr-1");
    assert.equal(captured.params.p_payment_id, "pay-1");
    assert.equal(captured.params.p_actor_id, "ar-1");
    assert.deepEqual(captured.params.p_allocations, [
      { amortizationScheduleId: "s1", amount: 2500 },
    ]);
  });

  it("propagates an RPC error instead of silently swallowing it", async () => {
    const { supabase } = makeAtomicStub({
      rpc: async () => ({ data: null, error: { message: "deadlock detected" } }),
    });

    await assert.rejects(
      () =>
        reconcileAndPostDcr(supabase, "dcr-1", "ar-1", {
          depositReference: "DEP-1",
          depositAmount: 2500,
        }),
      /deadlock detected/,
    );
  });

  it("treats a { skipped: true } RPC response as a clean no-op — the DCR still gets marked reconciled", async () => {
    const { supabase } = makeAtomicStub({
      rpc: async () => ({ data: { skipped: true }, error: null }),
    });

    const result = await reconcileAndPostDcr(supabase, "dcr-1", "ar-1", {
      depositReference: "DEP-1",
      depositAmount: 2500,
    });

    assert.equal(result.status, "reconciled");
  });
});

/**
 * Regression coverage for Phase 4 (see
 * docs/ledger-balance-consistency-fix-implementation-plan.md) — these two
 * functions had zero prior test coverage, so this is the only guard against
 * a regression in their new derived-balance wiring.
 */
describe("writeOffRoundingDifference", () => {
  function makeWriteOffStub(opts: {
    schedule?: Record<string, unknown>;
    threshold?: number;
    otherOpenRows?: Array<Record<string, unknown>>;
  } = {}) {
    const schedule = opts.schedule ?? {
      id: "s1",
      masterlist_id: "ml-1",
      amount_due: 1000.5,
      penalty_amount: 0,
      discount_amount: 0,
      amount_paid: 1000,
      status: "pending",
    };
    const threshold = opts.threshold ?? 1.0;
    const otherOpenRows = opts.otherOpenRows ?? [];

    let masterlistUpdate: Record<string, unknown> | null = null;
    let scheduleUpdate: Record<string, unknown> | null = null;
    const inserted: Array<Record<string, unknown>> = [];

    const supabase = {
      from(table: string) {
        if (table === "amortization_schedules") {
          return {
            select: () => ({
              eq: (_col: string, id: string) => ({
                maybeSingle: async () =>
                  id === schedule.id
                    ? { data: schedule, error: null }
                    : { data: null, error: null },
                // Shared by recomputeOutstandingBalance (.eq(masterlistId).not(...),
                // awaited directly) and isAccountFullySettled
                // (.eq(masterlistId).not(...).limit(1)) — the just-written-off
                // row is already 'paid' in the real flow (excluded
                // server-side by the status filter), so this stub mirrors
                // that by simply not including it in otherOpenRows.
                not: () => {
                  const result = { data: [...otherOpenRows], error: null };
                  return {
                    limit: () => Promise.resolve(result),
                    then: (resolve: (v: typeof result) => void) => resolve(result),
                  };
                },
              }),
            }),
            update: (payload: Record<string, unknown>) => ({
              eq: async () => {
                scheduleUpdate = payload;
                return { error: null };
              },
            }),
          };
        }
        if (table === "config_settings") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { value: threshold }, error: null }),
              }),
            }),
          };
        }
        if (table === "rounding_writeoffs") {
          return {
            insert: async (payload: Record<string, unknown>) => {
              inserted.push(payload);
              return { error: null };
            },
          };
        }
        if (table === "masterlist") {
          return {
            update: (payload: Record<string, unknown>) => ({
              eq: async () => {
                masterlistUpdate = payload;
                return { error: null };
              },
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    return {
      supabase: supabase as never,
      getMasterlistUpdate: () => masterlistUpdate,
      getScheduleUpdate: () => scheduleUpdate,
      getInserted: () => inserted,
    };
  }

  it("derives the new balance from the rows, excluding the just-written-off installment", async () => {
    const { supabase, getMasterlistUpdate } = makeWriteOffStub({
      otherOpenRows: [
        {
          amount_due: 5000,
          discount_amount: 0,
          penalty_amount: 0,
          amount_paid: 0,
          status: "pending",
        },
      ],
    });

    await writeOffRoundingDifference(supabase, "ml-1", "s1", "actor-1");

    assert.equal(getMasterlistUpdate()?.outstanding_balance, 5000);
    assert.equal(getMasterlistUpdate()?.account_status, "active");
  });

  it("sets account_status paid when the derived balance reaches 0", async () => {
    const { supabase, getMasterlistUpdate } = makeWriteOffStub({ otherOpenRows: [] });

    await writeOffRoundingDifference(supabase, "ml-1", "s1", "actor-1");

    assert.equal(getMasterlistUpdate()?.outstanding_balance, 0);
    assert.equal(getMasterlistUpdate()?.account_status, "paid");
  });

  it("keeps account_status active when the balance derives to 0 but another row is still open (F8, Phase 6)", async () => {
    // A row whose net due happens to be 0 (e.g. a legacy fully-discounted
    // row never transitioned to 'paid') still sits 'pending' — the balance
    // derives to 0, but the account is not actually done.
    const { supabase, getMasterlistUpdate } = makeWriteOffStub({
      otherOpenRows: [
        {
          amount_due: 500,
          discount_amount: 500,
          penalty_amount: 0,
          amount_paid: 0,
          status: "pending",
        },
      ],
    });

    await writeOffRoundingDifference(supabase, "ml-1", "s1", "actor-1");

    assert.equal(getMasterlistUpdate()?.outstanding_balance, 0);
    assert.equal(getMasterlistUpdate()?.account_status, "active");
  });
});

describe("writeOffAccountRoundingDifference", () => {
  function makeAccountWriteOffStub(opts: {
    outstandingBalance?: number;
    threshold?: number;
    scheduleStatuses?: string[];
  } = {}) {
    const outstandingBalance = opts.outstandingBalance ?? 0.5;
    const threshold = opts.threshold ?? 1.0;
    const scheduleStatuses = opts.scheduleStatuses ?? ["paid", "paid"];

    let masterlistUpdate: Record<string, unknown> | null = null;
    const inserted: Array<Record<string, unknown>> = [];

    const supabase = {
      from(table: string) {
        if (table === "masterlist") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: "ml-1",
                    outstanding_balance: outstandingBalance,
                    amortization_schedules: scheduleStatuses.map((status) => ({
                      status,
                    })),
                  },
                  error: null,
                }),
              }),
            }),
            update: (payload: Record<string, unknown>) => ({
              eq: async () => {
                masterlistUpdate = payload;
                return { error: null };
              },
            }),
          };
        }
        if (table === "config_settings") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { value: threshold }, error: null }),
              }),
            }),
          };
        }
        if (table === "rounding_writeoffs") {
          return {
            insert: async (payload: Record<string, unknown>) => {
              inserted.push(payload);
              return { error: null };
            },
          };
        }
        if (table === "amortization_schedules") {
          // Every row is already paid/rolled (eligibility above requires
          // it), so both recomputeOutstandingBalance's and
          // isAccountFullySettled's filtered queries return nothing.
          return {
            select: () => ({
              eq: () => ({
                not: () => {
                  const result = { data: [], error: null };
                  return {
                    limit: () => Promise.resolve(result),
                    then: (resolve: (v: typeof result) => void) => resolve(result),
                  };
                },
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    return {
      supabase: supabase as never,
      getMasterlistUpdate: () => masterlistUpdate,
      getInserted: () => inserted,
    };
  }

  it("derives the new balance as 0 once every row is already paid/rolled", async () => {
    const { supabase, getMasterlistUpdate } = makeAccountWriteOffStub();

    await writeOffAccountRoundingDifference(supabase, "ml-1", "actor-1");

    assert.equal(getMasterlistUpdate()?.outstanding_balance, 0);
    assert.equal(getMasterlistUpdate()?.account_status, "paid");
  });
});
