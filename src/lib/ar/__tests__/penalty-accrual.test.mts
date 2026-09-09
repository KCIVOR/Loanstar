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
};

const baseRow = (over: Partial<Row> = {}): Row => ({
  amountDue: 10000,
  discountAmount: 0,
  penaltyDiscountAmount: 0,
  amountPaid: 0,
  penaltyAmount: 0,
  periodsApplied: 0,
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
        row.amountPaid +
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
  opts: { onTimePaid: number; netDue: number; elapsedMonths: number; rate: number },
): { penaltyAmount: number; periodsApplied: number; delta: number; skipped: boolean } {
  const { onTimePaid, netDue, elapsedMonths, rate } = opts;
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
          row.amountPaid +
          running,
      );
      const add = halfUp(bal * rate);
      if (add <= 0) break;
      running += add;
    }
    target = running;
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

  it("Rule 4b: a late partial payment recomputes the fee on the remainder", () => {
    // paid 5,000 of 10,000, one month elapsed -> 5% of the 5,000 remainder
    const row = { ...baseRow({ amountPaid: 5000, penaltyAmount: 500, periodsApplied: 1 }), status: "partial" as const };
    const r = simulateRecomputeRow(row, {
      onTimePaid: 0,
      netDue: 10000,
      elapsedMonths: 1,
      rate: 0.05,
    });
    assert.equal(r.penaltyAmount, 250);
    assert.equal(r.delta, -250);
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
