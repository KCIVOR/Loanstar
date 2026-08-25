import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createPendingInternalTransfers } from "../release-service";

type ComputationRow = {
  id: string;
  loan_application_id: string;
  is_active: boolean;
  other_deductions: unknown;
  [key: string]: unknown;
};

/** Minimal fake Supabase client covering exactly the chains this function
 * uses: internal_transfers (idempotency select + insert), computations
 * (getActiveComputation's select chain), masterlist (account lookup). */
function fakeSupabase(opts: {
  existingTransfers?: Array<{ id: string }>;
  computationRow?: ComputationRow | null;
  masterlistByAccountNo?: Record<string, { id: string }>;
}) {
  const inserted: Array<Record<string, unknown>> = [];
  const existingTransfers = opts.existingTransfers ?? [];
  const masterlistByAccountNo = opts.masterlistByAccountNo ?? {};

  const client = {
    from(table: string) {
      if (table === "internal_transfers") {
        return {
          select() {
            return {
              eq() {
                return {
                  limit: async () => ({ data: existingTransfers, error: null }),
                };
              },
            };
          },
          insert(row: Record<string, unknown>) {
            inserted.push(row);
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      if (table === "computations") {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      order() {
                        return {
                          limit() {
                            return {
                              maybeSingle: async () => ({
                                data: opts.computationRow ?? null,
                                error: null,
                              }),
                            };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "masterlist") {
        return {
          select() {
            return {
              eq(_col: string, accountNo: string) {
                return {
                  maybeSingle: async () => ({
                    data: masterlistByAccountNo[accountNo] ?? null,
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  return { client, inserted };
}

describe("createPendingInternalTransfers", () => {
  it("creates one row per resolvable target, tagged with the source loan", async () => {
    const { client, inserted } = fakeSupabase({
      computationRow: {
        id: "comp-1",
        loan_application_id: "app-1",
        is_active: true,
        other_deductions: {
          offsets: [{ accountNo: "AN2", amount: 32252, months: 2 }],
        },
      },
      masterlistByAccountNo: { AN2: { id: "ml-target" } },
    });

    await createPendingInternalTransfers(
      client as never,
      "app-1",
      "ml-source",
      "actor-1",
    );

    assert.equal(inserted.length, 1);
    assert.deepEqual(inserted[0], {
      source_loan_application_id: "app-1",
      source_masterlist_id: "ml-source",
      target_masterlist_id: "ml-target",
      transfer_type: "offset",
      months: 2,
      amount: 32252,
      created_by: "actor-1",
    });
  });

  it("skips an unresolvable account without throwing or inserting", async () => {
    const { client, inserted } = fakeSupabase({
      computationRow: {
        id: "comp-1",
        loan_application_id: "app-1",
        is_active: true,
        other_deductions: {
          otherLoans: [{ accountNo: "AN-DOES-NOT-EXIST", amount: 5000 }],
        },
      },
      masterlistByAccountNo: {},
    });

    await assert.doesNotReject(() =>
      createPendingInternalTransfers(client as never, "app-1", "ml-source", "actor-1"),
    );
    assert.equal(inserted.length, 0);
  });

  it("is idempotent — does nothing if a transfer already exists for this loan", async () => {
    const { client, inserted } = fakeSupabase({
      existingTransfers: [{ id: "existing-1" }],
      computationRow: {
        id: "comp-1",
        loan_application_id: "app-1",
        is_active: true,
        other_deductions: {
          otherLoans: [{ accountNo: "AN2", amount: 5000 }],
        },
      },
      masterlistByAccountNo: { AN2: { id: "ml-target" } },
    });

    await createPendingInternalTransfers(client as never, "app-1", "ml-source", "actor-1");
    assert.equal(inserted.length, 0);
  });

  it("no-ops when the computation has no deductions", async () => {
    const { client, inserted } = fakeSupabase({
      computationRow: {
        id: "comp-1",
        loan_application_id: "app-1",
        is_active: true,
        other_deductions: {},
      },
    });

    await createPendingInternalTransfers(client as never, "app-1", "ml-source", "actor-1");
    assert.equal(inserted.length, 0);
  });

  it("never throws even if the client itself errors", async () => {
    const client = {
      from() {
        throw new Error("boom");
      },
    };

    await assert.doesNotReject(() =>
      createPendingInternalTransfers(client as never, "app-1", "ml-source", "actor-1"),
    );
  });
});
