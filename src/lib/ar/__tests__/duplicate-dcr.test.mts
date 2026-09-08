import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findInstallmentConflicts,
  findOverAllocatedInstallments,
  isUnpostedDcrStatus,
  loadClaimedScheduleIdsAmong,
  loadDcrAllocationsWithMasterlist,
  loadDcrScheduleIds,
  loadPendingAllocationsForAccount,
  summarizeUnpostedForAccount,
} from "../duplicate-dcr";

/**
 * Minimal PostgREST-shaped stub. `tables` maps a table name to its rows; the
 * builder applies `.eq / .in / .neq / .not` in memory and resolves (when
 * awaited) to `{ data: <filtered>, error: null }`.
 */
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
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: filtered, error: null }),
    };
    return b;
  }
  return { from: (t: string) => builder(tables[t] ?? []) } as never;
}


describe("isUnpostedDcrStatus", () => {
  it("true only for draft / submitted", () => {
    assert.equal(isUnpostedDcrStatus("draft"), true);
    assert.equal(isUnpostedDcrStatus("submitted"), true);
    assert.equal(isUnpostedDcrStatus("SUBMITTED"), true);
    assert.equal(isUnpostedDcrStatus(" draft "), true);
  });
  it("false for reconciled / rejected / unknown / empty", () => {
    assert.equal(isUnpostedDcrStatus("reconciled"), false);
    assert.equal(isUnpostedDcrStatus("rejected"), false);
    assert.equal(isUnpostedDcrStatus("posted"), false);
    assert.equal(isUnpostedDcrStatus(""), false);
  });
});

describe("summarizeUnpostedForAccount", () => {
  it("clean account — nothing unposted", () => {
    const r = summarizeUnpostedForAccount([
      { amount: 5000, status: "posted", reference_no: "OR-1" },
      { amount: 3000, status: "rejected", reference_no: "OR-2" },
    ]);
    assert.deepEqual(r, { count: 0, totalAmount: 0, references: [] });
  });

  it("one confirmed payment", () => {
    const r = summarizeUnpostedForAccount([
      { amount: "3000.00", status: "confirmed", reference_no: "OR-9" },
    ]);
    assert.deepEqual(r, { count: 1, totalAmount: 3000, references: ["OR-9"] });
  });

  it("mixes pending_verification + confirmed, excludes posted/rejected", () => {
    const r = summarizeUnpostedForAccount([
      { amount: 30000, status: "confirmed", reference_no: "BR-100" },
      { amount: 9000, status: "pending_verification", reference_no: "BR-101" },
      { amount: 39000, status: "posted", reference_no: "BR-050" }, // excluded
      { amount: 1000, status: "rejected", reference_no: "BR-102" }, // excluded
    ]);
    assert.equal(r.count, 2);
    assert.equal(r.totalAmount, 39000);
    assert.deepEqual(r.references, ["BR-100", "BR-101"]);
  });

  it("drops blank / null reference numbers but still counts the payment", () => {
    const r = summarizeUnpostedForAccount([
      { amount: 500, status: "confirmed", reference_no: "  " },
      { amount: 250, status: "confirmed", reference_no: null },
      { amount: 250, status: "confirmed" },
    ]);
    assert.equal(r.count, 3);
    assert.equal(r.totalAmount, 1000);
    assert.deepEqual(r.references, []);
  });

  it("half-up sum over messy amounts", () => {
    const r = summarizeUnpostedForAccount([
      { amount: "100.005", status: "confirmed" },
      { amount: 0.005, status: "confirmed" },
      { amount: null, status: "confirmed" },
    ]);
    assert.equal(r.count, 3);
    // sumHalfUp rounds at each addition step
    assert.equal(r.totalAmount, 100.02);
  });
});

describe("findInstallmentConflicts", () => {
  it("no overlap → []", () => {
    assert.deepEqual(findInstallmentConflicts(["a", "b"], ["c", "d"]), []);
  });
  it("full overlap", () => {
    assert.deepEqual(findInstallmentConflicts(["a", "b"], ["b", "a"]), ["a", "b"]);
  });
  it("partial overlap, in candidate order", () => {
    assert.deepEqual(
      findInstallmentConflicts(["x", "y", "z"], ["z", "x"]),
      ["x", "z"],
    );
  });
  it("ignores null / undefined / blank on both sides (advance lines)", () => {
    assert.deepEqual(
      findInstallmentConflicts(["a", null, "", undefined], [null, "a", ""]),
      ["a"],
    );
  });
  it("de-dupes a candidate id that appears twice", () => {
    assert.deepEqual(findInstallmentConflicts(["a", "a", "b"], ["a"]), ["a"]);
  });
  it("empty inputs", () => {
    assert.deepEqual(findInstallmentConflicts([], ["a"]), []);
    assert.deepEqual(findInstallmentConflicts(["a"], []), []);
  });
});

describe("loadClaimedScheduleIdsAmong", () => {
  it("returns [] without hitting the DB when there are no candidate ids", async () => {
    const out = await loadClaimedScheduleIdsAmong(
      makeLoaderStub({}),
      [null, undefined, ""],
      "dcr-x",
    );
    assert.deepEqual(out, []);
  });

  it("finds an installment claimed by a PENDING item on another DRAFT DCRR", async () => {
    const db = {
      dcr_item_allocations: [
        { amortization_schedule_id: "s1", dcr_item_id: "it-1" },
      ],
      dcr_items: [{ id: "it-1", dcr_id: "dcr-other", status: "pending" }],
      dcr: [{ id: "dcr-other", status: "draft" }],
    };
    const out = await loadClaimedScheduleIdsAmong(
      makeLoaderStub(db),
      ["s1", "s2"],
      "dcr-current",
    );
    assert.deepEqual(out, ["s1"]);
  });

  it("ignores the current DCRR (excludeDcrId)", async () => {
    const db = {
      dcr_item_allocations: [
        { amortization_schedule_id: "s1", dcr_item_id: "it-1" },
      ],
      dcr_items: [{ id: "it-1", dcr_id: "dcr-current", status: "pending" }],
      dcr: [{ id: "dcr-current", status: "draft" }],
    };
    assert.deepEqual(
      await loadClaimedScheduleIdsAmong(makeLoaderStub(db), ["s1"], "dcr-current"),
      [],
    );
  });

  it("ignores a reconciled / rejected DCRR", async () => {
    for (const status of ["reconciled", "rejected"]) {
      const db = {
        dcr_item_allocations: [
          { amortization_schedule_id: "s1", dcr_item_id: "it-1" },
        ],
        dcr_items: [{ id: "it-1", dcr_id: "dcr-done", status: "pending" }],
        dcr: [{ id: "dcr-done", status }],
      };
      assert.deepEqual(
        await loadClaimedScheduleIdsAmong(makeLoaderStub(db), ["s1"], "x"),
        [],
        `status ${status} must not count`,
      );
    }
  });

  it("ignores a posted item even on a draft DCRR", async () => {
    const db = {
      dcr_item_allocations: [
        { amortization_schedule_id: "s1", dcr_item_id: "it-1" },
      ],
      dcr_items: [{ id: "it-1", dcr_id: "dcr-o", status: "posted" }],
      dcr: [{ id: "dcr-o", status: "draft" }],
    };
    assert.deepEqual(
      await loadClaimedScheduleIdsAmong(makeLoaderStub(db), ["s1"], "x"),
      [],
    );
  });

  it("throws (does not swallow) a query error", async () => {
    const errStub = {
      from: () => ({
        select: () => ({
          in: () => ({
            then: (resolve: (v: unknown) => void) =>
              resolve({ data: null, error: { message: "boom" } }),
          }),
        }),
      }),
    } as never;
    await assert.rejects(
      () => loadClaimedScheduleIdsAmong(errStub, ["s1"], "x"),
      /allocation lookup failed: boom/,
    );
  });
});

describe("loadDcrScheduleIds", () => {
  it("returns the DCRR's distinct non-null allocation schedule ids", async () => {
    const db = {
      dcr_items: [
        { id: "it-1", dcr_id: "dcr-1" },
        { id: "it-2", dcr_id: "dcr-1" },
      ],
      dcr_item_allocations: [
        { amortization_schedule_id: "s1", dcr_item_id: "it-1" },
        { amortization_schedule_id: "s2", dcr_item_id: "it-1" },
        { amortization_schedule_id: "s1", dcr_item_id: "it-2" },
      ],
    };
    const out = await loadDcrScheduleIds(makeLoaderStub(db), "dcr-1");
    assert.deepEqual([...out].sort(), ["s1", "s2"]);
  });

  it("returns [] when the DCRR has no items", async () => {
    assert.deepEqual(
      await loadDcrScheduleIds(makeLoaderStub({ dcr_items: [] }), "dcr-1"),
      [],
    );
  });
});

describe("loadPendingAllocationsForAccount", () => {
  it("sums pending allocations per installment on draft/submitted DCRRs", async () => {
    const db = {
      payments: [
        { id: "p1", masterlist_id: "ml-1" },
        { id: "p2", masterlist_id: "ml-1" },
        { id: "p3", masterlist_id: "ml-1" },
      ],
      dcr_items: [
        { id: "it-1", dcr_id: "dcr-draft", payment_id: "p1", status: "pending" },
        { id: "it-2", dcr_id: "dcr-sub", payment_id: "p2", status: "pending" },
        { id: "it-3", dcr_id: "dcr-done", payment_id: "p3", status: "posted" },
      ],
      dcr: [
        { id: "dcr-draft", status: "draft" },
        { id: "dcr-sub", status: "submitted" },
        { id: "dcr-done", status: "reconciled" },
      ],
      dcr_item_allocations: [
        { amortization_schedule_id: "s1", amount: 3000, dcr_item_id: "it-1" },
        { amortization_schedule_id: "s1", amount: 1000, dcr_item_id: "it-2" },
        { amortization_schedule_id: "s2", amount: 500, dcr_item_id: "it-2" },
        { amortization_schedule_id: "s9", amount: 9999, dcr_item_id: "it-3" }, // posted item — excluded
      ],
    };
    const out = await loadPendingAllocationsForAccount(
      makeLoaderStub(db),
      "ml-1",
    );
    assert.deepEqual(out, {
      s1: { amount: 4000, dcrCount: 2 },
      s2: { amount: 500, dcrCount: 1 },
    });
  });

  it("excludeDcrId drops the DCRR currently being built", async () => {
    const db = {
      payments: [{ id: "p1", masterlist_id: "ml-1" }],
      dcr_items: [
        { id: "it-1", dcr_id: "dcr-self", payment_id: "p1", status: "pending" },
      ],
      dcr: [{ id: "dcr-self", status: "draft" }],
      dcr_item_allocations: [
        { amortization_schedule_id: "s1", amount: 3000, dcr_item_id: "it-1" },
      ],
    };
    assert.deepEqual(
      await loadPendingAllocationsForAccount(makeLoaderStub(db), "ml-1", "dcr-self"),
      {},
    );
  });

  it("returns {} when the account has no payments", async () => {
    assert.deepEqual(
      await loadPendingAllocationsForAccount(
        makeLoaderStub({ payments: [] }),
        "ml-1",
      ),
      {},
    );
  });
});

describe("findOverAllocatedInstallments", () => {
  it("empty candidate → []", () => {
    assert.deepEqual(
      findOverAllocatedInstallments({
        candidate: {},
        pending: { s1: 999 },
        remainingDue: { s1: 1000 },
      }),
      [],
    );
  });

  it("partly-claimed installment with room left is NOT flagged", () => {
    // 15232 pending elsewhere + 3668 new = 18900 = exactly the due
    assert.deepEqual(
      findOverAllocatedInstallments({
        candidate: { s5: 3668 },
        pending: { s5: 15232 },
        remainingDue: { s5: 18900 },
      }),
      [],
    );
  });

  it("flags an installment pushed past its due once pending is included", () => {
    assert.deepEqual(
      findOverAllocatedInstallments({
        candidate: { s5: 3669 },
        pending: { s5: 15232 },
        remainingDue: { s5: 18900 },
      }),
      ["s5"],
    );
  });

  it("flags a fresh installment already fully claimed elsewhere", () => {
    assert.deepEqual(
      findOverAllocatedInstallments({
        candidate: { s1: 1000 },
        pending: { s1: 1000 },
        remainingDue: { s1: 1000 },
      }),
      ["s1"],
    );
  });

  it("missing remainingDue entry defaults to 0 → any positive candidate over-fills", () => {
    assert.deepEqual(
      findOverAllocatedInstallments({
        candidate: { sX: 0.01 },
        pending: {},
        remainingDue: {},
      }),
      ["sX"],
    );
  });

  it("absorbs sub-half-centavo rounding via the default tolerance", () => {
    assert.deepEqual(
      findOverAllocatedInstallments({
        candidate: { s1: 500.002 },
        pending: { s1: 500 },
        remainingDue: { s1: 1000 },
      }),
      [],
    );
  });

  it("returns every over-allocated id", () => {
    assert.deepEqual(
      findOverAllocatedInstallments({
        candidate: { s1: 600, s2: 100, s3: 5000 },
        pending: { s1: 600, s3: 0 },
        remainingDue: { s1: 1000, s2: 1000, s3: 1000 },
      }),
      ["s1", "s3"],
    );
  });
});

describe("loadDcrAllocationsWithMasterlist", () => {
  it("joins this DCRR's allocation lines to each payment's masterlist", async () => {
    const db = {
      dcr_items: [
        { id: "it-1", dcr_id: "dcr-1", payment_id: "p1" },
        { id: "it-2", dcr_id: "dcr-1", payment_id: "p2" },
      ],
      payments: [
        { id: "p1", masterlist_id: "ml-A" },
        { id: "p2", masterlist_id: "ml-B" },
      ],
      dcr_item_allocations: [
        { amortization_schedule_id: "s1", amount: 400, dcr_item_id: "it-1" },
        { amortization_schedule_id: "s2", amount: "600.00", dcr_item_id: "it-1" },
        { amortization_schedule_id: null, amount: 50, dcr_item_id: "it-2" },
      ],
    };
    const out = await loadDcrAllocationsWithMasterlist(
      makeLoaderStub(db),
      "dcr-1",
    );
    assert.deepEqual(out, [
      { scheduleId: "s1", amount: 400, masterlistId: "ml-A" },
      { scheduleId: "s2", amount: 600, masterlistId: "ml-A" },
      { scheduleId: null, amount: 50, masterlistId: "ml-B" },
    ]);
  });

  it("returns [] when the DCRR has no items", async () => {
    assert.deepEqual(
      await loadDcrAllocationsWithMasterlist(
        makeLoaderStub({ dcr_items: [] }),
        "dcr-1",
      ),
      [],
    );
  });
});
