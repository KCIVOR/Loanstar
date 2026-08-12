import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { halfUp } from "../../computation/money";
import {
  calculatePenaltyAmount,
  computeAgingBucket,
  daysPastDue,
  DEFAULT_AGING_THRESHOLDS,
} from "../schedule";

/**
 * Pure one-account aging step mirroring refreshMasterlistAging / SQL port.
 * Used for Phase 7 parity fixtures (0 / 1 / 30 dpd + idempotence).
 */
export function simulateAgingStep(input: {
  schedules: Array<{
    id: string;
    installmentNo: number;
    dueDate: string;
    status: string;
    amountDue: number;
    amountPaid: number;
    penaltyAmount: number;
    rolledAt: string | null;
  }>;
  asOf: string;
  penaltyRate?: number;
  thresholds?: typeof DEFAULT_AGING_THRESHOLDS;
}) {
  const rate = input.penaltyRate ?? 0.05;
  const thresholds = input.thresholds ?? DEFAULT_AGING_THRESHOLDS;
  const asOf = new Date(input.asOf);

  const unpaid = input.schedules.filter((s) => s.status !== "paid");
  const overdue = unpaid
    .filter((s) => s.status !== "rolled")
    .filter((s) => daysPastDue(s.dueDate, asOf) > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  let agingBucket = "current" as ReturnType<typeof computeAgingBucket>;
  if (overdue) {
    agingBucket = computeAgingBucket(daysPastDue(overdue.dueDate, asOf), thresholds);
  }

  const result = {
    agingBucket,
    remedialFlag: agingBucket === "91+",
    penaltyWritten: null as null | { installmentId: string; penaltyAmount: number; delta: number },
    rollover: null as null | {
      fromId: string;
      intoInstallmentNo: number;
      rollAmount: number;
    },
  };

  if (!overdue || daysPastDue(overdue.dueDate, asOf) < 1) {
    return result;
  }

  let finalPenalty = overdue.penaltyAmount;
  const outstanding =
    overdue.amountDue - overdue.amountPaid + overdue.penaltyAmount;
  const penalty = calculatePenaltyAmount(outstanding, rate);
  if (penalty > overdue.penaltyAmount) {
    result.penaltyWritten = {
      installmentId: overdue.id,
      penaltyAmount: penalty,
      delta: halfUp(penalty - overdue.penaltyAmount),
    };
    finalPenalty = penalty;
  }

  const dpd = daysPastDue(overdue.dueDate, asOf);
  if (dpd >= thresholds.t30 && !overdue.rolledAt) {
    const next = unpaid
      .filter((s) => s.id !== overdue.id && s.status !== "rolled")
      .sort((a, b) => a.installmentNo - b.installmentNo)[0];
    if (next) {
      const rollAmount = halfUp(
        overdue.amountDue - overdue.amountPaid + finalPenalty,
      );
      result.rollover = {
        fromId: overdue.id,
        intoInstallmentNo: next.installmentNo,
        rollAmount,
      };
    }
  }

  return result;
}

describe("computeAgingBucket (90-day remedial threshold)", () => {
  const t = DEFAULT_AGING_THRESHOLDS;

  it("maps the frozen dpd → bucket / remedial table (default t90=90)", () => {
    const cases: Array<{
      dpd: number;
      bucket: ReturnType<typeof computeAgingBucket>;
      remedial: boolean;
    }> = [
      { dpd: 0, bucket: "current", remedial: false },
      { dpd: 30, bucket: "1-30", remedial: false },
      { dpd: 60, bucket: "31-60", remedial: false },
      { dpd: 89, bucket: "61-90", remedial: false },
      { dpd: 90, bucket: "91+", remedial: true },
      { dpd: 91, bucket: "91+", remedial: true },
    ];

    for (const row of cases) {
      const bucket = computeAgingBucket(row.dpd, t);
      assert.equal(
        bucket,
        row.bucket,
        `dpd ${row.dpd}: expected bucket ${row.bucket}, got ${bucket}`,
      );
      assert.equal(
        bucket === "91+",
        row.remedial,
        `dpd ${row.dpd}: expected remedial ${row.remedial}`,
      );
    }
  });
});

describe("halfUp (Phase 7 SQL parity target)", () => {
  it("matches known centavo cases the SQL half_up must reproduce", () => {
    assert.equal(halfUp(1.005), 1.01);
    assert.equal(halfUp(17.4282), 17.43);
    assert.equal(halfUp(100 * 0.05), 5);
    assert.equal(halfUp(1234.567), 1234.57);
  });
});

describe("simulateAgingStep (Phase 7 parity fixtures)", () => {
  const base = {
    id: "i1",
    installmentNo: 1,
    dueDate: "2026-06-01",
    status: "pending",
    amountDue: 10000,
    amountPaid: 0,
    penaltyAmount: 0,
    rolledAt: null as string | null,
  };
  const next = {
    id: "i2",
    installmentNo: 2,
    dueDate: "2026-07-01",
    status: "pending",
    amountDue: 10000,
    amountPaid: 0,
    penaltyAmount: 0,
    rolledAt: null as string | null,
  };

  it("0 dpd — no penalty, current bucket", () => {
    const out = simulateAgingStep({
      schedules: [
        { ...base, dueDate: "2026-08-01" },
        { ...next, dueDate: "2026-09-01" },
      ],
      asOf: "2026-07-17T12:00:00.000Z",
    });
    assert.equal(out.agingBucket, "current");
    assert.equal(out.penaltyWritten, null);
    assert.equal(out.rollover, null);
  });

  it("1 dpd — applies penalty once", () => {
    const out = simulateAgingStep({
      schedules: [{ ...base, dueDate: "2026-07-16" }, next],
      asOf: "2026-07-17T12:00:00.000Z",
      penaltyRate: 0.05,
    });
    assert.equal(out.agingBucket, "1-30");
    assert.ok(out.penaltyWritten);
    assert.equal(out.penaltyWritten!.penaltyAmount, 500);
    assert.equal(out.penaltyWritten!.delta, 500);
    assert.equal(out.rollover, null);
  });

  it("1 dpd SME vs Seafarer — different config rates, same outstanding (Phase 5.4)", () => {
    const schedules = [{ ...base, dueDate: "2026-07-16" }, next];
    const asOf = "2026-07-17T12:00:00.000Z";
    const sme = simulateAgingStep({
      schedules,
      asOf,
      penaltyRate: 0.05, // penalty_rate_sme
    });
    const seafarer = simulateAgingStep({
      schedules,
      asOf,
      penaltyRate: 0.15, // penalty_rate (live Seafarer config)
    });
    assert.equal(sme.penaltyWritten!.penaltyAmount, 500);
    assert.equal(seafarer.penaltyWritten!.penaltyAmount, 1500);
    assert.notEqual(
      sme.penaltyWritten!.penaltyAmount,
      seafarer.penaltyWritten!.penaltyAmount,
    );
  });

  it("30 dpd — single rollover into next installment", () => {
    const out = simulateAgingStep({
      schedules: [{ ...base, dueDate: "2026-06-17" }, next],
      asOf: "2026-07-17T12:00:00.000Z",
      penaltyRate: 0.05,
    });
    assert.equal(out.agingBucket, "1-30");
    assert.ok(out.penaltyWritten);
    assert.ok(out.rollover);
    assert.equal(out.rollover!.intoInstallmentNo, 2);
    // outstanding 10000 + penalty 500 = 10500 rolled
    assert.equal(out.rollover!.rollAmount, 10500);
  });

  it("repeat run after rollover — no second rollover/penalty write", () => {
    const rolled = {
      ...base,
      dueDate: "2026-06-17",
      status: "rolled",
      penaltyAmount: 500,
      rolledAt: "2026-07-17T01:00:00.000Z",
    };
    const nextLoaded = {
      ...next,
      amountDue: 20500,
    };
    const out = simulateAgingStep({
      schedules: [rolled, nextLoaded],
      asOf: "2026-07-18T12:00:00.000Z",
      penaltyRate: 0.05,
    });
    // next is due 2026-07-01 → 17 dpd, not yet 30; may get penalty but not from rolled
    assert.equal(out.rollover, null);
    assert.notEqual(out.penaltyWritten?.installmentId, "i1");
  });
});
