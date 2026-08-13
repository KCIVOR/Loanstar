import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addPaymentToDcr,
  computeAutoAllocation,
  reconcileAndPostDcr,
  type AllocationLine,
  type OpenInstallment,
} from "../posting";

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

    await addPaymentToDcr(supabase, "dcr-1", "pay-1", "collector-1");

    const expected = computeAutoAllocation(2500, [
      inst({ id: "s1", installmentNo: 1, amountDue: 1000 }),
      inst({ id: "s2", installmentNo: 2, amountDue: 1500 }),
    ]);
    assert.deepEqual(getInsertedAllocations(), expected);
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
      }
    >;
  };

  function makeReconcileStub(opts: ReconcileStubOpts = {}) {
    const postings: Array<Record<string, unknown>> = [];
    const scheduleUpdates: Array<Record<string, unknown>> = [];

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
});
