import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deriveEffectiveBalance } from "../effective-balance";

describe("deriveEffectiveBalance", () => {
  it("with no pending, effective equals posted", () => {
    const result = deriveEffectiveBalance({
      postedInstallments: [
        { id: "a", netRemaining: 5000 },
        { id: "b", netRemaining: 3000 },
      ],
      allocatedPendingByScheduleId: new Map(),
      unallocatedPendingTotal: 0,
    });

    assert.equal(result.postedTotal, 8000);
    assert.equal(result.effectiveTotal, 8000);
    assert.equal(result.pendingAllocatedTotal, 0);
    assert.equal(result.pendingUnallocatedTotal, 0);
    assert.deepEqual(
      result.perInstallment.map((r) => r.effectiveRemaining),
      [5000, 3000],
    );
  });

  it("one allocated-pending installment reduces just that row and the total", () => {
    const result = deriveEffectiveBalance({
      postedInstallments: [
        { id: "a", netRemaining: 5000 },
        { id: "b", netRemaining: 3000 },
      ],
      allocatedPendingByScheduleId: new Map([["a", 2000]]),
      unallocatedPendingTotal: 0,
    });

    assert.equal(result.postedTotal, 8000);
    assert.equal(result.effectiveTotal, 6000);
    assert.equal(result.pendingAllocatedTotal, 2000);
    const rowA = result.perInstallment.find((r) => r.id === "a")!;
    const rowB = result.perInstallment.find((r) => r.id === "b")!;
    assert.equal(rowA.effectiveRemaining, 3000);
    assert.equal(rowB.effectiveRemaining, 3000);
  });

  it("over-allocated pending floors the installment and the total at 0, never negative", () => {
    const result = deriveEffectiveBalance({
      postedInstallments: [{ id: "a", netRemaining: 5000 }],
      // More pending than the installment actually owes — e.g. a penalty
      // that later reverted after the DCR was drafted.
      allocatedPendingByScheduleId: new Map([["a", 9000]]),
      unallocatedPendingTotal: 0,
    });

    assert.equal(result.effectiveTotal, 0);
    assert.equal(result.perInstallment[0].effectiveRemaining, 0);
    // pendingApplied and pendingAllocatedTotal show the true recorded
    // amount, uncapped — an over-allocation stays visible (e.g. for
    // diagnosing why an installment shows 0 effective remaining) even though
    // effectiveRemaining itself floors at 0. Only the *remaining* figures
    // floor; the pending figures never lie about what's actually pending.
    assert.equal(result.perInstallment[0].pendingApplied, 9000);
    assert.equal(result.pendingAllocatedTotal, 9000);
  });

  it("unallocated-only pending reduces the account total but no installment row", () => {
    const result = deriveEffectiveBalance({
      postedInstallments: [
        { id: "a", netRemaining: 5000 },
        { id: "b", netRemaining: 3000 },
      ],
      allocatedPendingByScheduleId: new Map(),
      unallocatedPendingTotal: 1500,
    });

    assert.equal(result.postedTotal, 8000);
    assert.equal(result.effectiveTotal, 6500);
    assert.equal(result.pendingUnallocatedTotal, 1500);
    assert.deepEqual(
      result.perInstallment.map((r) => r.effectiveRemaining),
      [5000, 3000],
    );
  });

  it("mixed allocated + unallocated pending combine correctly", () => {
    const result = deriveEffectiveBalance({
      postedInstallments: [
        { id: "a", netRemaining: 5000 },
        { id: "b", netRemaining: 3000 },
      ],
      allocatedPendingByScheduleId: new Map([["a", 2000]]),
      unallocatedPendingTotal: 1000,
    });

    assert.equal(result.postedTotal, 8000);
    // 8000 - 2000 (allocated) - 1000 (unallocated) = 5000
    assert.equal(result.effectiveTotal, 5000);
    assert.equal(result.pendingAllocatedTotal, 2000);
    assert.equal(result.pendingUnallocatedTotal, 1000);
  });

  it("account-level effective total floors at 0 when unallocated pending exceeds what's left", () => {
    const result = deriveEffectiveBalance({
      postedInstallments: [{ id: "a", netRemaining: 1000 }],
      allocatedPendingByScheduleId: new Map(),
      unallocatedPendingTotal: 5000,
    });

    assert.equal(result.effectiveTotal, 0);
  });

  it("rejected/posted rows are excluded by the caller, not this function — an empty account is a no-op", () => {
    const result = deriveEffectiveBalance({
      postedInstallments: [],
      allocatedPendingByScheduleId: new Map([["stale-id", 500]]),
      unallocatedPendingTotal: 0,
    });

    assert.equal(result.postedTotal, 0);
    assert.equal(result.effectiveTotal, 0);
    assert.deepEqual(result.perInstallment, []);
  });
});
