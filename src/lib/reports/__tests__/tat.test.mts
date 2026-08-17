import test from "node:test";
import assert from "node:assert/strict";

import { computeSlaBreachesFromHistories, computeTatFromHistories, TAT_PAIRS } from "../aggregates";

test("TAT computes average days between status transitions", () => {
  const histories = [
    [
      { status: "submitted", at: "2026-01-01T00:00:00Z" },
      { status: "for_verification", at: "2026-01-04T00:00:00Z" },
      { status: "for_approval", at: "2026-01-10T00:00:00Z" },
      { status: "approved", at: "2026-01-12T00:00:00Z" },
    ],
  ];

  const tat = computeTatFromHistories(histories);
  const intake = tat.find((t) => t.from === "submitted");
  assert.ok(intake);
  assert.equal(intake!.averageDays, 3);
  assert.equal(intake!.sampleCount, 1);
});

test("computeSlaBreachesFromHistories counts only transitions past their target", () => {
  const intakeTarget = TAT_PAIRS.find((p) => p.label === "Intake → CIG")!.targetDays;
  assert.equal(intakeTarget, 2);

  const histories = [
    // Within target (1 day) — not a breach.
    [
      { status: "submitted", at: "2026-01-01T00:00:00Z" },
      { status: "for_verification", at: "2026-01-02T00:00:00Z" },
    ],
    // Past target (5 days) — a breach.
    [
      { status: "submitted", at: "2026-02-01T00:00:00Z" },
      { status: "for_verification", at: "2026-02-06T00:00:00Z" },
    ],
  ];

  const breaches = computeSlaBreachesFromHistories(histories);
  const intake = breaches.find((b) => b.label === "Intake → CIG");
  assert.ok(intake);
  assert.equal(intake!.sampleCount, 2);
  assert.equal(intake!.breachCount, 1);
});

test("computeSlaBreachesFromHistories never flags Active → Paid off (no processing SLA)", () => {
  const histories = [
    [
      { status: "loan_active", at: "2026-01-01T00:00:00Z" },
      { status: "paid_off", at: "2027-06-01T00:00:00Z" },
    ],
  ];
  const breaches = computeSlaBreachesFromHistories(histories);
  const paidOff = breaches.find((b) => b.label === "Active → Paid off");
  assert.ok(paidOff);
  assert.equal(paidOff!.breachCount, 0);
});
