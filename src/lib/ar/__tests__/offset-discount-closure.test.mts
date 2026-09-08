import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { interestByInstallment } from "../../computation/offset-interest";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Pure JS mirror of the LEGACY even-split discount block still used by the
 * `transfer_type = 'offset'` (partial payment) branch of `post_internal_transfer`
 * (migrations/20260908132813_post_internal_transfer_full_settlement.sql). Kept
 * to prove that branch is byte-preserved; partial offsets never actually carry
 * a discount, so this only ever runs in tests.
 */
function simulateEvenSplit(input: {
  rows: Array<{ installmentNo: number; discountAmount: number }>;
  discountedInstallmentNos: number[];
  netDiscount: number;
}): Map<number, number> {
  const result = new Map<number, number>();
  for (const row of input.rows) result.set(row.installmentNo, row.discountAmount);
  const sorted = [...input.discountedInstallmentNos].sort((a, b) => a - b);
  if (sorted.length === 0) return result;
  for (const no of sorted) result.set(no, 0);
  if (sorted.length > 1) {
    const perRow = round2(input.netDiscount / (sorted.length - 1));
    sorted.forEach((no, idx) => {
      if (idx === 0) return;
      result.set(no, perRow);
    });
  }
  return result;
}

/**
 * Pure JS mirror of the NEW `transfer_type = 'other_loan'` (full settlement)
 * path of `post_internal_transfer` — greedy cap-and-carry discount, cash
 * re-trued against the live balance, shortfall block, force-paid + residue
 * absorb. See docs/revision-plans/task-02-offset-full-settlement-plan.md.
 */
function simulateFullSettlement(input: {
  balance: number;
  csaDiscount: number;
  transferAmount: number;
  discountedInstallmentNos: number[];
  principal?: number;
  rows: Array<{
    installmentNo: number;
    amountDue: number;
    amountPaid?: number;
    penalty?: number;
    lineType?: string;
    status?: string;
  }>;
}): {
  blocked: boolean;
  discountApplied: number;
  discountByRow: Map<number, number>;
  finalBalance: number;
} {
  const rows = input.rows.map((r) => ({
    installmentNo: r.installmentNo,
    amountDue: r.amountDue,
    amountPaid: r.amountPaid ?? 0,
    penalty: r.penalty ?? 0,
    lineType: r.lineType ?? "standard",
    status: r.status ?? "pending",
    discount: 0,
  }));
  const open = rows.filter((r) =>
    ["pending", "partial", "overdue"].includes(r.status),
  );
  const netOwed = (r: (typeof rows)[number]) =>
    round2(r.amountDue + r.penalty - r.discount - r.amountPaid);

  // budget = least(csaDiscount, balance − largest unpaid row)
  const largestRow = open.length > 0 ? Math.max(...open.map((r) => r.amountDue)) : 0;
  const budget = Math.min(
    input.csaDiscount,
    Math.max(0, round2(input.balance - largestRow)),
  );

  // principal-balloon row (line_type 'standard' on weekly/invoice) — the
  // largest open row when it's at/above the loan principal; never discounted.
  const balloonNo =
    input.principal !== undefined && largestRow >= input.principal * 0.99
      ? [...open]
          .filter((r) => r.amountDue === largestRow)
          .sort((a, b) => b.installmentNo - a.installmentNo)[0]?.installmentNo
      : undefined;

  const discountable = open
    .filter(
      (r) =>
        input.discountedInstallmentNos.includes(r.installmentNo) &&
        r.lineType !== "principal" &&
        r.installmentNo !== balloonNo,
    )
    .sort((a, b) => a.installmentNo - b.installmentNo);

  let applied = 0;
  discountable.forEach((r, idx) => {
    if (idx === 0) return; // termination-fee row
    if (budget - applied <= 0) return;
    const cap = Math.max(0, round2(r.amountDue + r.penalty - r.amountPaid));
    const thisDisc = Math.min(budget - applied, cap);
    if (thisDisc <= 0) return;
    r.discount = thisDisc;
    applied = round2(applied + thisDisc);
  });

  const requiredCash = Math.max(0, round2(input.balance - applied));
  if (input.transferAmount < requiredCash - 0.01) {
    return {
      blocked: true,
      discountApplied: applied,
      discountByRow: new Map(rows.map((r) => [r.installmentNo, r.discount])),
      finalBalance: input.balance,
    };
  }

  // waterfall the cash oldest-first
  let remaining = requiredCash;
  for (const r of [...open].sort((a, b) => a.installmentNo - b.installmentNo)) {
    if (remaining <= 0) break;
    const totalDue = round2(r.amountDue + r.penalty - r.discount);
    const applyAmt = Math.min(remaining, round2(totalDue - r.amountPaid));
    if (applyAmt <= 0) continue;
    r.amountPaid = round2(r.amountPaid + applyAmt);
    remaining = round2(remaining - applyAmt);
  }

  // force-paid rows (net ≤ 0.01) contribute 0; then absorb a ≤ ₱1 residue
  let finalBal = round2(
    open.reduce((s, r) => s + Math.max(0, netOwed(r)), 0),
  );
  if (finalBal > 0 && finalBal <= 1.0) finalBal = 0;

  return {
    blocked: false,
    discountApplied: applied,
    discountByRow: new Map(rows.map((r) => [r.installmentNo, r.discount])),
    finalBalance: finalBal,
  };
}

// ---------------------------------------------------------------------------

describe("post_internal_transfer — legacy 'offset' (partial) even-split, byte-preserved", () => {
  it("splits netDiscount evenly, first ticked row absorbs the termination fee", () => {
    const r = simulateEvenSplit({
      rows: [2, 3, 4].map((installmentNo) => ({ installmentNo, discountAmount: 0 })),
      discountedInstallmentNos: [2, 3, 4],
      netDiscount: 300,
    });
    assert.equal(r.get(2), 0);
    assert.equal(r.get(3), 150);
    assert.equal(r.get(4), 150);
  });

  it("clears any pre-existing origination discount on a ticked row (never sums)", () => {
    const r = simulateEvenSplit({
      rows: [
        { installmentNo: 3, discountAmount: 999 },
        { installmentNo: 4, discountAmount: 0 },
      ],
      discountedInstallmentNos: [3, 4],
      netDiscount: 100,
    });
    assert.equal(r.get(3), 0);
    assert.equal(r.get(4), 100);
  });
});

describe("post_internal_transfer — 'other_loan' full settlement (Task 2)", () => {
  // AN300442's real shape: 12 small interest rows + one ₱115,560 principal
  // balloon (line_type is 'standard' on this weekly schedule, so the SQL
  // relies on the (balance − largest_row) budget cap, mirrored here).
  const balloonRows = [
    ...[1, 2, 3, 4].map((n) => ({ installmentNo: n, amountDue: 1155.6 })),
    ...[5, 6, 7, 8].map((n) => ({ installmentNo: n, amountDue: 2311.2 })),
    ...[9, 10, 11, 12].map((n) => ({ installmentNo: n, amountDue: 2889.0 })),
    { installmentNo: 13, amountDue: 115560.0 },
  ];
  const balloonBalance = round2(
    balloonRows.reduce((s, r) => s + r.amountDue, 0),
  ); // 134,983.20

  it("balloon schedule: no discount lands on the principal row, none is wasted, loan closes at 0", () => {
    // Even if every row incl. the balloon is ticked, and the amount sent is the
    // whole balance, the principal row is excluded and the loan still closes.
    const res = simulateFullSettlement({
      balance: balloonBalance,
      principal: 115560,
      csaDiscount: 18489.6, // = rows 6..12 (row 5 is the fee row)
      transferAmount: balloonBalance,
      discountedInstallmentNos: [5, 6, 7, 8, 9, 10, 11, 12, 13],
      rows: balloonRows,
    });
    assert.equal(res.blocked, false);
    assert.equal(res.discountByRow.get(13), 0, "principal balloon never discounted");
    assert.equal(res.discountApplied, 18489.6, "full discount lands on interest rows, none wasted");
    assert.equal(res.finalBalance, 0, "loan closes at exactly 0");
  });

  it("balloon schedule with amount = balance − discount also closes at 0", () => {
    // Post-Phase-2 CSA figure: interest of ticked rows 7,8 minus the row-6 fee.
    const csaDiscount = 2311.2 * 2; // rows 7 + 8
    const res = simulateFullSettlement({
      balance: balloonBalance,
      principal: 115560,
      csaDiscount,
      transferAmount: round2(balloonBalance - csaDiscount),
      discountedInstallmentNos: [6, 7, 8],
      rows: balloonRows,
    });
    assert.equal(res.blocked, false);
    assert.equal(res.finalBalance, 0);
  });

  it("equal-row loan: discount spreads across ticked rows after the fee row, closes at 0", () => {
    const rows = [1, 2, 3, 4, 5, 6].map((n) => ({ installmentNo: n, amountDue: 10000 }));
    const res = simulateFullSettlement({
      balance: 60000,
      csaDiscount: 12000,
      transferAmount: 48000,
      discountedInstallmentNos: [2, 3, 4, 5, 6],
      rows,
    });
    assert.equal(res.blocked, false);
    assert.equal(res.discountByRow.get(2), 0, "first ticked row = termination fee");
    assert.equal(res.discountApplied, 12000);
    assert.equal(res.finalBalance, 0);
  });

  it("blocks when the offset cannot cover the re-trued cash", () => {
    const rows = [1, 2, 3].map((n) => ({ installmentNo: n, amountDue: 10000 }));
    const res = simulateFullSettlement({
      balance: 30000,
      csaDiscount: 0,
      transferAmount: 20000, // 10k short of the 30k needed
      discountedInstallmentNos: [],
      rows,
    });
    assert.equal(res.blocked, true);
  });

  it("plain full settlement (no discount) closes at 0", () => {
    const rows = [1, 2, 3].map((n) => ({ installmentNo: n, amountDue: 10000 }));
    const res = simulateFullSettlement({
      balance: 30000,
      csaDiscount: 0,
      transferAmount: 30000,
      discountedInstallmentNos: [],
      rows,
    });
    assert.equal(res.blocked, false);
    assert.equal(res.finalBalance, 0);
  });

  it("never discounts a line_type='principal' row even when ticked", () => {
    const rows = [
      { installmentNo: 1, amountDue: 2000, lineType: "interest" },
      { installmentNo: 2, amountDue: 2000, lineType: "interest" },
      { installmentNo: 3, amountDue: 2000, lineType: "interest" },
      { installmentNo: 4, amountDue: 100000, lineType: "principal" },
    ];
    const res = simulateFullSettlement({
      balance: 106000,
      csaDiscount: 4000,
      transferAmount: 106000,
      discountedInstallmentNos: [1, 2, 3, 4],
      rows,
    });
    assert.equal(res.discountByRow.get(4), 0);
    assert.equal(res.finalBalance, 0);
  });

  it("closes a fractional balance exactly (no centavo left 'active')", () => {
    const rows = [
      { installmentNo: 1, amountDue: 1000 },
      { installmentNo: 2, amountDue: 1000 },
      { installmentNo: 3, amountDue: 1000.33 },
    ];
    const res = simulateFullSettlement({
      balance: 3000.33,
      csaDiscount: 0,
      transferAmount: 3000.33,
      discountedInstallmentNos: [],
      rows,
    });
    assert.equal(res.blocked, false);
    assert.equal(res.finalBalance, 0);
  });
});

describe("interestByInstallment (Task 2 Phase 2)", () => {
  it("weekly interest-only + balloon: each small row is its own interest, balloon carries none", () => {
    const rows = [
      ...[1, 2, 3, 4].map((n) => ({ installmentNo: n, amountDue: 1155.6, lineType: "standard" })),
      ...[5, 6, 7, 8].map((n) => ({ installmentNo: n, amountDue: 2311.2, lineType: "standard" })),
      ...[9, 10, 11, 12].map((n) => ({ installmentNo: n, amountDue: 2889.0, lineType: "standard" })),
      { installmentNo: 13, amountDue: 115560.0, lineType: "standard" },
    ];
    // rows 1-12 sum to 24,231.60 ≈ total_interest
    const m = interestByInstallment(rows, { totalInterest: 24231.6, principal: 115560 });
    assert.equal(m.get(3), 1155.6);
    assert.equal(m.get(7), 2311.2);
    assert.equal(m.get(13), 0, "principal balloon carries no interest");
    // NOT total_interest / terms (the old bug)
    assert.notEqual(m.get(7), round2(24231.6 / 3));
  });

  it("dual-line Special: interest rows carry their own amount, principal rows carry 0", () => {
    const rows = [
      { installmentNo: 1, amountDue: 500, lineType: "interest" },
      { installmentNo: 2, amountDue: 0, lineType: "principal" },
      { installmentNo: 3, amountDue: 500, lineType: "interest" },
      { installmentNo: 4, amountDue: 20000, lineType: "principal" },
    ];
    const m = interestByInstallment(rows, { totalInterest: 1000, principal: 20000 });
    assert.equal(m.get(1), 500);
    assert.equal(m.get(3), 500);
    assert.equal(m.get(4), 0);
  });

  it("blended monthly: even split across the real rows", () => {
    const rows = [1, 2, 3, 4, 5, 6].map((n) => ({
      installmentNo: n,
      amountDue: 5000,
      lineType: "standard",
    }));
    const m = interestByInstallment(rows, { totalInterest: 6000, principal: 24000 });
    assert.equal(m.get(1), 1000);
    assert.equal(m.get(6), 1000);
  });
});
