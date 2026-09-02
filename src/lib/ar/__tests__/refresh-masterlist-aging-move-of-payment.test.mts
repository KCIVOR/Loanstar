import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { refreshMasterlistAging } from "../posting";

/**
 * Regression coverage for Phase 3 (see
 * docs/revision-plans/feature-move-of-payment-implementation-plan.md) —
 * the Move of Payment revert block in refreshMasterlistAging, and its
 * Addendum 2 extension: deleting the installment row(s) a lapsed batch
 * appended to the end of the schedule. This exercises the real function
 * directly (not a reimplementation), since the revert logic lives inside
 * the DB-backed function itself.
 *
 * Every fixture keeps the *other* schedule rows current (due dates in the
 * future relative to `asOf`) so the pre-existing, untouched overdue/
 * penalty/rollover/discount-reversion blocks never fire — these tests are
 * scoped to the revert path only.
 */
describe("refreshMasterlistAging — Move of Payment revert (Phase 3 + Addendum 2)", () => {
  const ASOF = new Date("2026-09-25T00:00:00Z");
  const FUTURE_DUE_DATE = "2026-12-31";

  function makeStub(opts: {
    movedRows: Array<{
      id: string;
      move_of_payment_deadline: string | null;
      move_of_payment_batch_id: string | null;
    }>;
    scheduleRows: Array<{
      id: string;
      installment_no: number;
      due_date: string;
      status: string;
      amount_due: number;
      amount_paid: number;
      penalty_amount: number;
      rolled_at: string | null;
      discount_amount: number;
    }>;
  }) {
    const scheduleUpdates: Array<{ kind: "in" | "eq"; ids: string[]; payload: Record<string, unknown> }> = [];
    const deleteCalls: Array<{ batchIds: string[] }> = [];
    const penaltyInserts: Array<Record<string, unknown>> = [];
    let masterlistUpdatePayload: Record<string, unknown> | null = null;

    const supabase = {
      from(table: string) {
        if (table === "masterlist") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    segment: "sme",
                    total_loan: 100000,
                    outstanding_balance: 50000,
                    loan_application_id: "la-1",
                  },
                  error: null,
                }),
              }),
            }),
            update: (payload: Record<string, unknown>) => ({
              eq: async () => {
                masterlistUpdatePayload = payload;
                return { error: null };
              },
            }),
          };
        }
        if (table === "amortization_schedules") {
          return {
            select: () => ({
              eq: (_col1: string, _val1: string) => ({
                // Move of Payment's own query:
                // .eq("masterlist_id", ...).eq("status", "moved")
                eq: async (_col2: string, _val2: string) => ({
                  data: opts.movedRows,
                  error: null,
                }),
                // The pre-existing schedules query:
                // .eq("masterlist_id", ...).neq("status", "paid").order(...)
                neq: () => ({
                  order: async () => ({ data: opts.scheduleRows, error: null }),
                }),
              }),
            }),
            update: (payload: Record<string, unknown>) => ({
              in: async (_col: string, ids: string[]) => {
                scheduleUpdates.push({ kind: "in", ids, payload });
                return { error: null };
              },
              eq: async (_col: string, id: string) => {
                scheduleUpdates.push({ kind: "eq", ids: [id], payload });
                return { error: null };
              },
            }),
            // Addendum 2 extension revert:
            // .delete().eq("masterlist_id", ...).eq("amount_paid", 0)
            //   .in("deferred_from_move_of_payment_batch_id", batchIds)
            delete: () => ({
              eq: () => ({
                eq: () => ({
                  in: async (_col: string, batchIds: string[]) => {
                    deleteCalls.push({ batchIds });
                    return { error: null };
                  },
                }),
              }),
            }),
          };
        }
        if (table === "config_settings") {
          return {
            select: () => ({
              in: async () => ({ data: [], error: null }),
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          };
        }
        if (table === "penalties") {
          return {
            insert: async (payload: Record<string, unknown>) => {
              penaltyInserts.push(payload);
              return { error: null };
            },
          };
        }
        if (table === "release_files") {
          // Phase 4b — a lapsed batch's PDC check lifecycle revert looks up
          // the release file. These fixtures have none, so the pdc_checks
          // block is skipped.
          return {
            select: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
            }),
          };
        }
        if (table === "pdc_checks") {
          const noop = { error: null };
          return {
            delete: () => ({ eq: () => ({ eq: () => ({ in: async () => noop }) }) }),
            update: () => ({ eq: () => ({ in: () => ({ in: async () => noop }) }) }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    return {
      supabase: supabase as never,
      getScheduleUpdates: () => scheduleUpdates,
      getDeleteCalls: () => deleteCalls,
      getPenaltyInserts: () => penaltyInserts,
      getMasterlistUpdate: () => masterlistUpdatePayload,
    };
  }

  it("reverts a single expired moved row back to pending and clears every Move of Payment field", async () => {
    const stub = makeStub({
      movedRows: [
        { id: "s1", move_of_payment_deadline: "2026-09-20", move_of_payment_batch_id: "batch-1" },
      ],
      scheduleRows: [
        {
          id: "s1",
          installment_no: 1,
          due_date: FUTURE_DUE_DATE,
          status: "pending",
          amount_due: 5000,
          amount_paid: 0,
          penalty_amount: 0,
          rolled_at: null,
          discount_amount: 0,
        },
      ],
    });

    await refreshMasterlistAging(stub.supabase, "ml-1", ASOF);

    const revertCall = stub.getScheduleUpdates().find((u) => u.kind === "in");
    assert.ok(revertCall, "expected an .in() revert update");
    assert.deepEqual(revertCall?.ids, ["s1"]);
    assert.equal(revertCall?.payload.status, "pending");
    assert.equal(revertCall?.payload.moved_at, null);
    assert.equal(revertCall?.payload.moved_to_installment_no, null);
    assert.equal(revertCall?.payload.move_surcharge_amount, null);
    assert.equal(revertCall?.payload.move_of_payment_deadline, null);
    assert.equal(revertCall?.payload.move_of_payment_batch_id, null);
  });

  it("deletes the appended extension row(s) for a lapsed batch, keyed by batch id", async () => {
    const stub = makeStub({
      movedRows: [
        { id: "s1", move_of_payment_deadline: "2026-09-20", move_of_payment_batch_id: "batch-1" },
      ],
      scheduleRows: [
        {
          id: "s1",
          installment_no: 1,
          due_date: FUTURE_DUE_DATE,
          status: "pending",
          amount_due: 5000,
          amount_paid: 0,
          penalty_amount: 0,
          rolled_at: null,
          discount_amount: 0,
        },
      ],
    });

    await refreshMasterlistAging(stub.supabase, "ml-1", ASOF);

    const deleteCalls = stub.getDeleteCalls();
    assert.equal(deleteCalls.length, 1);
    assert.deepEqual(deleteCalls[0]?.batchIds, ["batch-1"]);
  });

  it("leaves a moved row with a still-future deadline untouched (no revert, no extension delete)", async () => {
    const stub = makeStub({
      movedRows: [
        { id: "s1", move_of_payment_deadline: "2099-01-01", move_of_payment_batch_id: "batch-1" },
      ],
      scheduleRows: [
        {
          id: "s1",
          installment_no: 1,
          due_date: FUTURE_DUE_DATE,
          status: "moved",
          amount_due: 5000,
          amount_paid: 0,
          penalty_amount: 0,
          rolled_at: null,
          discount_amount: 0,
        },
      ],
    });

    await refreshMasterlistAging(stub.supabase, "ml-1", ASOF);

    assert.equal(stub.getScheduleUpdates().find((u) => u.kind === "in"), undefined);
    assert.equal(stub.getDeleteCalls().length, 0);
  });

  it("reverts every row in a size-2 batch together, and deletes the extension once for the shared batch id", async () => {
    const stub = makeStub({
      movedRows: [
        { id: "s1", move_of_payment_deadline: "2026-09-20", move_of_payment_batch_id: "batch-1" },
        { id: "s2", move_of_payment_deadline: "2026-09-20", move_of_payment_batch_id: "batch-1" },
      ],
      scheduleRows: [
        {
          id: "s1",
          installment_no: 1,
          due_date: FUTURE_DUE_DATE,
          status: "pending",
          amount_due: 3000,
          amount_paid: 0,
          penalty_amount: 0,
          rolled_at: null,
          discount_amount: 0,
        },
        {
          id: "s2",
          installment_no: 2,
          due_date: FUTURE_DUE_DATE,
          status: "pending",
          amount_due: 15000,
          amount_paid: 0,
          penalty_amount: 0,
          rolled_at: null,
          discount_amount: 0,
        },
      ],
    });

    await refreshMasterlistAging(stub.supabase, "ml-1", ASOF);

    const revertCall = stub.getScheduleUpdates().find((u) => u.kind === "in");
    assert.ok(revertCall);
    assert.deepEqual([...revertCall!.ids].sort(), ["s1", "s2"]);

    const deleteCalls = stub.getDeleteCalls();
    assert.equal(deleteCalls.length, 1);
    assert.deepEqual(deleteCalls[0]?.batchIds, ["batch-1"]);
  });

  it("does NOT penalise a moved row whose original due date has passed but whose deadline has not (Fixes Plan Phase 1, Issue 8)", async () => {
    const stub = makeStub({
      // deadline is far in the future — the revert block must not fire...
      movedRows: [
        { id: "s1", move_of_payment_deadline: "2099-01-01", move_of_payment_batch_id: "batch-1" },
      ],
      // ...but the moved row's ORIGINAL due date is already in the past
      // relative to ASOF (2026-09-25). Before the fix this made the aging
      // pass treat it as the overdue installment and penalise it.
      scheduleRows: [
        {
          id: "s1",
          installment_no: 1,
          due_date: "2026-09-10",
          status: "moved",
          amount_due: 5000,
          amount_paid: 0,
          penalty_amount: 0,
          rolled_at: null,
          discount_amount: 0,
        },
      ],
    });

    const result = await refreshMasterlistAging(stub.supabase, "ml-1", ASOF);

    // No status flip to 'overdue', no penalty write, no revert, no delete.
    assert.equal(
      stub.getScheduleUpdates().find((u) => u.kind === "eq"),
      undefined,
      "a moved row must not be updated to 'overdue'",
    );
    assert.equal(stub.getScheduleUpdates().find((u) => u.kind === "in"), undefined);
    assert.equal(stub.getPenaltyInserts().length, 0, "no penalty may be charged on a moved row");
    assert.equal(stub.getDeleteCalls().length, 0);
    assert.equal(result.agingBucket, "current");
  });

  it("does nothing extra when there are no moved rows at all", async () => {
    const stub = makeStub({
      movedRows: [],
      scheduleRows: [
        {
          id: "s1",
          installment_no: 1,
          due_date: FUTURE_DUE_DATE,
          status: "pending",
          amount_due: 5000,
          amount_paid: 0,
          penalty_amount: 0,
          rolled_at: null,
          discount_amount: 0,
        },
      ],
    });

    const result = await refreshMasterlistAging(stub.supabase, "ml-1", ASOF);

    assert.equal(stub.getScheduleUpdates().length, 0);
    assert.equal(stub.getDeleteCalls().length, 0);
    assert.equal(result.agingBucket, "current");
  });
});
