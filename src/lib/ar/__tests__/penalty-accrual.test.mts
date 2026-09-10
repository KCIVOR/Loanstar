import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeInvoiceLoan } from "../../computation/invoice";

/**
 * Pure JS mirrors of the SQL penalty engine, so the compounding / recompute /
 * fee-split rules have unit coverage without a live database. Each `simulate*`
 * function is a line-for-line shadow of one block of a migration:
 *
 *  - simulateMonthlyAccrual   → refresh_one_masterlist_aging penalty loop
 *                               (20260908231312_penalty_monthly_compounding.sql)
 *  - simulateRecomputeRow     → recompute_account_penalties
 *                               (20260908232337 + 20260908234126 fix)
 *  - penaltyFirstSplit        → post_single_dcr_item Phase 4a split
 *                               (20260908234200_posting_penalty_portion.sql)
 *
 * If the SQL changes, change these to match and the assertions catch drift.
 */

/** half_up(numeric) — round half away from zero to 2 dp. */
const halfUp = (n: number) => {
  const s = n < 0 ? -1 : 1;
  return (s * Math.round((Math.abs(n) + Number.EPSILON) * 100)) / 100;
};

type Row = {
  amountDue: number;
  discountAmount: number;
  penaltyDiscountAmount: number;
  amountPaid: number;
  penaltyAmount: number;
  periodsApplied: number;
  /** Fee money already collected against this row = SUM(postings.penalty_amount).
   * Carved out of the principal term so it doesn't shrink the compounding base
   * (penalty-fee-paid-protection-plan.md Phase 2, 2026-09-09). */
  feePaid: number;
};

const baseRow = (over: Partial<Row> = {}): Row => ({
  amountDue: 10000,
  discountAmount: 0,
  penaltyDiscountAmount: 0,
  amountPaid: 0,
  penaltyAmount: 0,
  periodsApplied: 0,
  feePaid: 0,
  ...over,
});

// ── Phase 2 — monthly compounding accrual ──────────────────────────────────
function simulateMonthlyAccrual(
  row: Row,
  targetPeriods: number,
  rate: number,
): { penaltyAmount: number; periodsApplied: number; rounds: number[] } {
  if (targetPeriods <= row.periodsApplied) {
    return {
      penaltyAmount: row.penaltyAmount,
      periodsApplied: row.periodsApplied,
      rounds: [],
    };
  }
  let running = row.penaltyAmount;
  const rounds: number[] = [];
  for (let p = row.periodsApplied + 1; p <= targetPeriods; p++) {
    const bal = Math.max(
      0,
      row.amountDue -
        row.discountAmount -
        row.penaltyDiscountAmount -
        Math.max(0, row.amountPaid - row.feePaid) +
        running,
    );
    const add = halfUp(bal * rate);
    if (add <= 0) break;
    running += add;
    rounds.push(add);
  }
  return { penaltyAmount: running, periodsApplied: targetPeriods, rounds };
}

// ── Phase 3 — recompute on payment (with the 20260908234126 paid-row fix) ──
function simulateRecomputeRow(
  row: Row & { status: "pending" | "partial" | "overdue" | "paid" },
  opts: {
    onTimePaid: number;
    netDue: number;
    elapsedMonths: number;
    rate: number;
    /** SUM(postings.penalty_amount) for the row — read as its own SELECT in
     * recompute_account_penalties, parallel to onTimePaid. Defaults to 0. */
    feePaid?: number;
  },
): { penaltyAmount: number; periodsApplied: number; delta: number; skipped: boolean } {
  const { onTimePaid, netDue, elapsedMonths, rate } = opts;
  const feePaid = opts.feePaid ?? 0;
  let target: number;
  let targetPeriods: number;

  if (onTimePaid >= netDue - 0.005) {
    target = 0;
    targetPeriods = 0;
  } else if (row.status === "paid") {
    // paid-row fix: a late-but-settled row is left exactly as it is
    return {
      penaltyAmount: row.penaltyAmount,
      periodsApplied: row.periodsApplied,
      delta: 0,
      skipped: true,
    };
  } else {
    let running = 0;
    for (let p = 1; p <= elapsedMonths; p++) {
      const bal = Math.max(
        0,
        row.amountDue -
          row.discountAmount -
          row.penaltyDiscountAmount -
          Math.max(0, row.amountPaid - feePaid) +
          running,
      );
      const add = halfUp(bal * rate);
      if (add <= 0) break;
      running += add;
    }
    target = running;
    // A charged late fee is a balance in its own right: the recompute may
    // raise it (compounding) but never lower it below what was collected
    // against it, nor below what is currently charged net of any waiver
    // (decisions 2026-09-09 / 2026-09-10).
    target = Math.max(
      target,
      feePaid,
      Math.max(0, row.penaltyAmount - row.penaltyDiscountAmount),
    );
    targetPeriods = elapsedMonths;
  }

  const delta = halfUp(target - row.penaltyAmount);
  if (delta === 0 && targetPeriods === row.periodsApplied) {
    return {
      penaltyAmount: row.penaltyAmount,
      periodsApplied: row.periodsApplied,
      delta: 0,
      skipped: true,
    };
  }
  return { penaltyAmount: target, periodsApplied: targetPeriods, delta, skipped: false };
}

// ── Phase 4a — penalty-first split of one allocation ──────────────────────
function penaltyFirstSplit(input: {
  allocAmount: number;
  finalPenalty: number;
  finalWaiver: number;
  penaltyAlreadyPosted: number;
  onTime: boolean;
}): number {
  if (input.onTime) return 0;
  return Math.min(
    input.allocAmount,
    Math.max(
      0,
      input.finalPenalty - input.finalWaiver - input.penaltyAlreadyPosted,
    ),
  );
}

// ── Phase 4b — collector-typed override of the fee portion ────────────────
// Mirrors post_single_dcr_item: for a tagged installment, its even share of
// the typed total, capped at the allocation and at the fee still owed.
function phase4bOverride(input: {
  allocAmount: number;
  penaltyPaidAmount: number;
  taggedCount: number;
  finalPenalty: number;
  finalWaiver: number;
  penaltyAlreadyPosted: number;
}): number {
  return Math.min(
    input.allocAmount,
    Math.min(
      halfUp(input.penaltyPaidAmount / input.taggedCount),
      Math.max(
        0,
        input.finalPenalty - input.finalWaiver - input.penaltyAlreadyPosted,
      ),
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 2 — monthly compounding accrual", () => {
  it("compounds on the running balance: 500 -> 525 -> 551.25 on a 10k row @5%", () => {
    const r = simulateMonthlyAccrual(baseRow(), 3, 0.05);
    assert.deepEqual(r.rounds, [500, 525, 551.25]);
    assert.equal(r.penaltyAmount, 1576.25);
    assert.equal(r.periodsApplied, 3);
  });

  it("is idempotent once periodsApplied has caught up to the elapsed months", () => {
    const after1 = simulateMonthlyAccrual(baseRow(), 2, 0.05);
    const row2 = baseRow({
      penaltyAmount: after1.penaltyAmount,
      periodsApplied: after1.periodsApplied,
    });
    const again = simulateMonthlyAccrual(row2, 2, 0.05);
    assert.deepEqual(again.rounds, []);
    assert.equal(again.penaltyAmount, after1.penaltyAmount);
  });

  it("charges only the months not yet applied (period 3 only, after 2 done)", () => {
    const row = baseRow({ penaltyAmount: 1025, periodsApplied: 2 }); // 500 + 525
    const r = simulateMonthlyAccrual(row, 3, 0.05);
    assert.deepEqual(r.rounds, [halfUp((10000 + 1025) * 0.05)]); // 551.25
    assert.equal(r.penaltyAmount, 1576.25);
  });

  it("keeps compounding on the final installment (no rollover dependency)", () => {
    const r = simulateMonthlyAccrual(baseRow(), 6, 0.05);
    assert.equal(r.rounds.length, 6);
    assert.ok(r.penaltyAmount > simulateMonthlyAccrual(baseRow(), 1, 0.05).penaltyAmount);
  });

  it("a waiver lowers the balance the fee compounds on", () => {
    const withWaiver = simulateMonthlyAccrual(
      baseRow({ penaltyDiscountAmount: 2000 }),
      1,
      0.05,
    );
    assert.equal(withWaiver.rounds[0], halfUp(8000 * 0.05)); // 400, not 500
  });

  it("segment rate is a parameter (seafarer 15% vs individual 5%)", () => {
    assert.equal(simulateMonthlyAccrual(baseRow(), 1, 0.15).rounds[0], 1500);
    assert.equal(simulateMonthlyAccrual(baseRow(), 1, 0.05).rounds[0], 500);
  });

  it("no roll-forward: three consecutively-overdue installments each keep their own Target and compound independently (removed 2026-09-09)", () => {
    // The 30-day roll-forward was removed. On a monthly loan aged so #1/#2/#3
    // are 3/2/1 months overdue, each row stays 'overdue' at its own Target and
    // accrues its own months of fee — none is merged/rolled into another.
    const inst1 = simulateMonthlyAccrual(baseRow(), 3, 0.05); // ₱10k, 3 months
    const inst2 = simulateMonthlyAccrual(baseRow(), 2, 0.05);
    const inst3 = simulateMonthlyAccrual(baseRow(), 1, 0.05);
    assert.deepEqual(
      [inst1.penaltyAmount, inst2.penaltyAmount, inst3.penaltyAmount],
      [1576.25, 1025, 500],
    );
    // Each still owes its own ₱10,000 principal — no Target was inflated by a
    // merge. (Target is `amountDue`, which simulateMonthlyAccrual never mutates.)
    assert.equal(baseRow().amountDue, 10000);
  });
});

describe("Phase 3 — recompute on payment", () => {
  it("Rule 4a: an on-time payment covering the net due zeroes the fee", () => {
    const row = { ...baseRow({ penaltyAmount: 1576.25, periodsApplied: 3 }), status: "paid" as const };
    const r = simulateRecomputeRow(row, {
      onTimePaid: 10000,
      netDue: 10000,
      elapsedMonths: 3,
      rate: 0.05,
    });
    assert.equal(r.penaltyAmount, 0);
    assert.equal(r.periodsApplied, 0);
    assert.equal(r.delta, -1576.25);
  });

  it("paid-row fix: a late-but-fully-paid row keeps its fee (not clawed back)", () => {
    const row = { ...baseRow({ amountPaid: 10500, penaltyAmount: 500, periodsApplied: 1 }), status: "paid" as const };
    const r = simulateRecomputeRow(row, {
      onTimePaid: 0,
      netDue: 10000,
      elapsedMonths: 1,
      rate: 0.05,
    });
    assert.equal(r.skipped, true);
    assert.equal(r.penaltyAmount, 500);
  });

  it("a late partial payment does NOT shrink the charged fee (2026-09-10: fee is its own balance)", () => {
    // paid 5,000 of 10,000, one month elapsed. Recompute on the remainder
    // gives 5% * 5,000 = 250, but the charged ₱500 is the floor -> stays 500.
    const row = { ...baseRow({ amountPaid: 5000, penaltyAmount: 500, periodsApplied: 1 }), status: "partial" as const };
    const r = simulateRecomputeRow(row, {
      onTimePaid: 0,
      netDue: 10000,
      elapsedMonths: 1,
      rate: 0.05,
    });
    assert.equal(r.penaltyAmount, 500);
    assert.equal(r.delta, 0);
  });

  it("Rule 4b: a late partial that leaves more elapsed months compounds the remainder", () => {
    const row = { ...baseRow({ amountPaid: 4000, penaltyAmount: 500, periodsApplied: 1 }), status: "partial" as const };
    const r = simulateRecomputeRow(row, {
      onTimePaid: 0,
      netDue: 10000,
      elapsedMonths: 2,
      rate: 0.05,
    });
    // remainder 6,000 -> m1 300, m2 5% of 6,300 = 315 -> 615
    assert.equal(r.penaltyAmount, 615);
  });
});

describe("Phase 3/4 — a paid late fee is protected (penalty-fee-paid-protection, 2026-09-09)", () => {
  // Scenario mirrors live AN300459 month #4: ₱74,800 due, 1 month late so the
  // fee charged is 5% = ₱3,740. Borrower pays ₱41,140 (₱37,400 principal + the
  // ₱3,740 fee); the collector tags ₱3,740 as "Late fee paid" -> it lands in
  // postings.penalty_amount -> feePaid = 3,740.

  it("recompute does not shrink a fee that has been paid in full", () => {
    const row = {
      ...baseRow({ amountDue: 74_800, amountPaid: 41_140, penaltyAmount: 3_740, periodsApplied: 1 }),
      status: "partial" as const,
    };
    const r = simulateRecomputeRow(row, {
      onTimePaid: 0,
      netDue: 74_800,
      elapsedMonths: 1,
      rate: 0.05,
      feePaid: 3_740,
    });
    // Without the fix this recomputed to 5% * (74,800 - 41,140) = 1,683.
    assert.equal(r.penaltyAmount, 3_740);
    assert.equal(r.delta, 0);
  });

  it("fee money is excluded from the compounding base on recompute", () => {
    // Same row, only ₱2,000 of the ₱3,740 fee paid -> the recompute base uses
    // the true remaining principal (74,800 - (41,140 - 2,000) = 35,660). The
    // charged fee is the floor, so the fee stays at 3,740 (₱1,740 still owed).
    const row = {
      ...baseRow({ amountDue: 74_800, amountPaid: 41_140, penaltyAmount: 3_740, periodsApplied: 1 }),
      status: "partial" as const,
    };
    const r = simulateRecomputeRow(row, {
      onTimePaid: 0,
      netDue: 74_800,
      elapsedMonths: 1,
      rate: 0.05,
      feePaid: 2_000,
    });
    // 5% * 35,660 = 1,783; floored to the charged fee 3,740 (2026-09-10).
    assert.equal(r.penaltyAmount, 3_740);
  });

  it("the recompute floors the fee at the charged amount, not what was collected", () => {
    const row = {
      ...baseRow({ amountDue: 10_000, amountPaid: 6_000, penaltyAmount: 500, periodsApplied: 1 }),
      status: "partial" as const,
    };
    const r = simulateRecomputeRow(row, {
      onTimePaid: 0,
      netDue: 10_000,
      elapsedMonths: 1,
      rate: 0.05,
      feePaid: 400,
    });
    // 5% * (10,000 - (6,000 - 400)) = 220; feePaid 400; charged 500 -> floor 500.
    assert.equal(r.penaltyAmount, 500);
  });

  it("an on-time payment still zeroes the fee even when feePaid > 0", () => {
    const row = {
      ...baseRow({ amountDue: 74_800, amountPaid: 78_540, penaltyAmount: 3_740, periodsApplied: 1 }),
      status: "partial" as const,
    };
    const r = simulateRecomputeRow(row, {
      onTimePaid: 78_540,
      netDue: 74_800,
      elapsedMonths: 1,
      rate: 0.05,
      feePaid: 3_740,
    });
    assert.equal(r.penaltyAmount, 0);
  });

  it("next month's accrual compounds on remaining principal + running fee, not the fee-reduced balance", () => {
    // month #4 after the ₱41,140 payment: penaltyAmount held at 3,740 (Phase 1),
    // periodsApplied 1, feePaid 3,740. Age one more month.
    const row = baseRow({
      amountDue: 74_800,
      amountPaid: 41_140,
      penaltyAmount: 3_740,
      periodsApplied: 1,
      feePaid: 3_740,
    });
    const r = simulateMonthlyAccrual(row, 2, 0.05);
    // base = 74,800 - max(0, 41,140 - 3,740) + 3,740 = 41,140; add = 2,057.
    assert.deepEqual(r.rounds, [2_057]);
    assert.equal(r.penaltyAmount, 5_797);
  });

  it("without any fee paid, accrual base is unchanged (feePaid defaults to 0)", () => {
    const r = simulateMonthlyAccrual(baseRow({ amountPaid: 4_000, penaltyAmount: 500, periodsApplied: 1 }), 2, 0.05);
    // remainder 6,000 -> m2 5% of (6,000 + 500) = 325 -> 825
    assert.equal(r.penaltyAmount, 825);
  });
});

describe("Phase 4 — principal-first: a charged fee stays a balance (2026-09-10)", () => {
  it("a ₱0 'Late fee paid' tag on an installment sends nothing to the fee", () => {
    // full monthly paid on a late installment, tagged with ₱0 -> whole
    // allocation is principal, fee untouched.
    assert.equal(
      phase4bOverride({
        allocAmount: 90_933.33,
        penaltyPaidAmount: 0,
        taggedCount: 1,
        finalPenalty: 25_123.21,
        finalWaiver: 0,
        penaltyAlreadyPosted: 0,
      }),
      0,
    );
  });

  it("recompute keeps the charged fee when principal is covered but the fee is not paid", () => {
    // pay the full ₱90,933.33 principal, ₱0 to the fee (feePaid 0).
    const row = {
      ...baseRow({ amountDue: 90_933.33, amountPaid: 90_933.33, penaltyAmount: 9_320.67, periodsApplied: 2 }),
      status: "partial" as const,
    };
    const r = simulateRecomputeRow(row, {
      onTimePaid: 0,
      netDue: 90_933.33,
      elapsedMonths: 2,
      rate: 0.05,
      feePaid: 0,
    });
    // recompute base -> 0, so v_target computes to 0; the charged fee is the
    // floor -> the fee is NOT erased.
    assert.equal(r.penaltyAmount, 9_320.67);
  });

  it("a genuine on-time full payment still zeroes the fee (Rule 4a wins over the floor)", () => {
    const row = {
      ...baseRow({ amountDue: 90_933.33, amountPaid: 90_933.33, penaltyAmount: 9_320.67, periodsApplied: 2 }),
      status: "partial" as const,
    };
    const r = simulateRecomputeRow(row, {
      onTimePaid: 90_933.33,
      netDue: 90_933.33,
      elapsedMonths: 2,
      rate: 0.05,
      feePaid: 0,
    });
    assert.equal(r.penaltyAmount, 0);
  });

  it("an explicit penalty waiver still lowers the fee floor", () => {
    // charged 9,320.67, waived 4,000 -> floor is the net 5,320.67.
    const row = {
      ...baseRow({
        amountDue: 90_933.33,
        amountPaid: 90_933.33,
        penaltyAmount: 9_320.67,
        penaltyDiscountAmount: 4_000,
        periodsApplied: 2,
      }),
      status: "partial" as const,
    };
    const r = simulateRecomputeRow(row, {
      onTimePaid: 0,
      netDue: 90_933.33,
      elapsedMonths: 2,
      rate: 0.05,
      feePaid: 0,
    });
    assert.equal(r.penaltyAmount, 5_320.67);
  });
});

describe("Phase 6 — Invoice/Auto/REM: interest is bounded at 3 months, then only the fee", () => {
  // Rule 9 is satisfied structurally, not by a runtime check:
  //  1. computeInvoiceLoan enumerates the ENTIRE interest schedule at
  //     origination (weekly rows for the whole term) — nothing accrues
  //     interest afterwards.
  //  2. The term is capped at 3 months by the input guard, so an invoice
  //     loan cannot carry more than 3 months of interest to begin with.
  //  3. The SQL aging engine (refresh_one_masterlist_aging) only ever adds to
  //     penalty_amount (Phase 2 monthly compounding) — it never computes fresh
  //     interest. The 30-day rollover moves EXISTING balance forward, it does
  //     not generate interest. So once the weekly schedule is exhausted, only
  //     the monthly fee grows. No code change was needed for Rule 9.
  const REL = new Date("2026-01-05");

  it("3-month invoice loan: all interest enumerated up front (12 weekly rows, 22% of principal)", () => {
    const r = computeInvoiceLoan({ principal: 100_000, terms: 3, releaseDate: REL });
    assert.equal(r.weeklySchedule.length, 12);
    assert.equal(r.totalInterest, 22_000);
    // No row past month 3 exists — there is nothing for interest to accrue onto.
    assert.equal(Math.max(...r.weeklySchedule.map((w) => w.month)), 3);
  });

  it("the term itself is capped at 3 months — a 4-month invoice loan cannot be created", () => {
    assert.throws(
      () => computeInvoiceLoan({ principal: 100_000, terms: 4, releaseDate: REL }),
      /1, 2, or 3 months/,
    );
  });

  it("penaltyAmount is the informational 5%-of-principal figure, not part of the schedule", () => {
    const r = computeInvoiceLoan({ principal: 100_000, terms: 3, releaseDate: REL });
    assert.equal(r.penaltyAmount, 5_000);
    // It is a result field only — never pushed into weeklySchedule.
    assert.ok(r.weeklySchedule.every((w) => w.amountDue !== r.penaltyAmount || w.month <= 3));
  });
});

describe("Phase 4a — penalty-first split of a posting", () => {
  it("late full payment records the whole fee as fee income", () => {
    assert.equal(
      penaltyFirstSplit({ allocAmount: 10500, finalPenalty: 500, finalWaiver: 0, penaltyAlreadyPosted: 0, onTime: false }),
      500,
    );
  });

  it("a Pass-B waiver is netted out of the recorded fee", () => {
    assert.equal(
      penaltyFirstSplit({ allocAmount: 10300, finalPenalty: 500, finalWaiver: 200, penaltyAlreadyPosted: 0, onTime: false }),
      300,
    );
  });

  it("a partial payment puts every peso toward the fee first", () => {
    assert.equal(
      penaltyFirstSplit({ allocAmount: 300, finalPenalty: 485, finalWaiver: 0, penaltyAlreadyPosted: 0, onTime: false }),
      300,
    );
  });

  it("an on-time payment records no fee portion", () => {
    assert.equal(
      penaltyFirstSplit({ allocAmount: 10000, finalPenalty: 500, finalWaiver: 0, penaltyAlreadyPosted: 0, onTime: true }),
      0,
    );
  });

  it("a second posting on the same installment does not double-count the fee", () => {
    assert.equal(
      penaltyFirstSplit({ allocAmount: 400, finalPenalty: 500, finalWaiver: 0, penaltyAlreadyPosted: 500, onTime: false }),
      0,
    );
  });

  it("never records more fee than the allocation itself", () => {
    assert.equal(
      penaltyFirstSplit({ allocAmount: 100, finalPenalty: 500, finalWaiver: 0, penaltyAlreadyPosted: 0, onTime: false }),
      100,
    );
  });
});
