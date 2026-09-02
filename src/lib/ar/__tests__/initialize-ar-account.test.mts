import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  enrollUnprocessedArQueue,
  initialScheduleRowStatus,
  initializeArAccount,
} from "../masterlist";

describe("initializeArAccount", () => {
  it("marks ar_queue processed when the masterlist row already exists", async () => {
    let queueUpdate: Record<string, unknown> | null = null;

    const supabase = {
      from(table: string) {
        if (table === "masterlist") {
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({
                      data: { id: "ml-1" },
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        }
        if (table === "ar_queue") {
          return {
            update(payload: Record<string, unknown>) {
              queueUpdate = payload;
              return {
                eq() {
                  return {
                    is: async () => ({ error: null }),
                  };
                },
              };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const result = await initializeArAccount(
      supabase as never,
      "app-1",
      "rf-1",
      "actor-1",
    );

    assert.deepEqual(result, { masterlistId: "ml-1", created: false });
    assert.equal(queueUpdate?.masterlist_id, "ml-1");
    assert.equal(typeof queueUpdate?.processed_at, "string");
  });
});

/**
 * Regression coverage for F1/F3 (see
 * docs/ledger-balance-consistency-fix-implementation-plan.md Phase 2): a
 * 100%-discounted installment must be born "paid", not "pending" — the only
 * two other code paths that ever mark a row "paid" (a cash posting, or a
 * rounding write-off) never run against a row with nothing left to collect,
 * so leaving it "pending" traps it there forever and exposes it to the
 * discount-reversion rule once its due date arrives.
 */
describe("initialScheduleRowStatus", () => {
  it("is born paid when the discount fully covers the amount due", () => {
    const result = initialScheduleRowStatus({
      amountDue: 913.0,
      discountAmount: 913.0,
      releaseDate: "2026-08-31",
    });
    assert.equal(result.status, "paid");
    assert.equal(result.paidAt, "2026-08-31");
  });

  it("stays pending when the discount only partially covers the amount due", () => {
    const result = initialScheduleRowStatus({
      amountDue: 21738.83,
      discountAmount: 2835.5,
      releaseDate: "2026-08-31",
    });
    assert.equal(result.status, "pending");
    assert.equal(result.paidAt, null);
  });

  it("stays pending on an undiscounted row", () => {
    const result = initialScheduleRowStatus({
      amountDue: 21738.83,
      discountAmount: 0,
      releaseDate: "2026-08-31",
    });
    assert.equal(result.status, "pending");
    assert.equal(result.paidAt, null);
  });

  it("is born paid when the discount slightly exceeds the amount due (rounding)", () => {
    const result = initialScheduleRowStatus({
      amountDue: 913.0,
      discountAmount: 913.01,
      releaseDate: "2026-08-31",
    });
    assert.equal(result.status, "paid");
  });
});

describe("enrollUnprocessedArQueue", () => {
  it("returns zeros when the receive queue is empty", async () => {
    const supabase = {
      from(table: string) {
        assert.equal(table, "ar_queue");
        return {
          select() {
            return {
              is: async () => ({ data: [], error: null }),
            };
          },
        };
      },
    };

    const result = await enrollUnprocessedArQueue(supabase as never, "actor-1");
    assert.deepEqual(result, { enrolled: 0, errors: [] });
  });
});
