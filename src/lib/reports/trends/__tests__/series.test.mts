import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeApprovalTrend } from "../approvals";
import { monthWindows } from "../calendar";
import { computeCollectionTrend } from "../collections";
import type { TrendInputs } from "../inputs";
import { computePortfolioTrend } from "../portfolio";
import type { TrendGroup } from "../types";

const NOW = new Date(2026, 7, 19);
const WINDOWS = monthWindows(6, NOW); // 2026-03 .. 2026-08

function inputs(partial: Partial<TrendInputs> = {}): TrendInputs {
  return {
    loans: [],
    schedules: [],
    postings: [],
    decisions: [],
    ...partial,
  };
}

function valuesOf(group: TrendGroup, seriesId: string): Array<number | null> {
  const series = group.series.find((s) => s.id === seriesId);
  assert.ok(series, `missing series ${seriesId}`);
  return series.points.map((p) => p.value);
}

describe("computePortfolioTrend", () => {
  const base = inputs({
    loans: [
      {
        id: "loan-1",
        totalLoan: 100_000,
        releaseDate: "2026-04-10",
        accountStatus: "active",
      },
    ],
    postings: [
      {
        scheduleId: "sch-1",
        masterlistId: "loan-1",
        amount: 20_000,
        postedAt: "2026-05-15T02:00:00.000Z",
      },
    ],
  });

  it("counts a release only in the month it happened", () => {
    const group = computePortfolioTrend(base, WINDOWS);
    assert.deepEqual(valuesOf(group, "portfolio.released"), [0, 100_000, 0, 0, 0, 0]);
  });

  it("carries outstanding forward and reduces it as cash is posted", () => {
    const group = computePortfolioTrend(base, WINDOWS);
    assert.deepEqual(
      valuesOf(group, "portfolio.outstanding"),
      [0, 100_000, 80_000, 80_000, 80_000, 80_000],
    );
  });

  it("counts the loan as active only once released and while a balance remains", () => {
    const group = computePortfolioTrend(base, WINDOWS);
    assert.deepEqual(valuesOf(group, "portfolio.activeLoans"), [0, 1, 1, 1, 1, 1]);
  });

  it("drops a loan out of active once it is fully paid", () => {
    const group = computePortfolioTrend(
      inputs({
        loans: base.loans,
        postings: [
          ...base.postings,
          {
            scheduleId: "sch-2",
            masterlistId: "loan-1",
            amount: 80_000,
            postedAt: "2026-06-20T02:00:00.000Z",
          },
        ],
      }),
      WINDOWS,
    );
    assert.deepEqual(valuesOf(group, "portfolio.activeLoans"), [0, 1, 1, 0, 0, 0]);
    assert.deepEqual(valuesOf(group, "portfolio.outstanding"), [0, 100_000, 80_000, 0, 0, 0]);
  });

  it("returns zeros and empty coverage when there are no loans", () => {
    const group = computePortfolioTrend(inputs(), WINDOWS);
    assert.deepEqual(valuesOf(group, "portfolio.outstanding"), [0, 0, 0, 0, 0, 0]);
    assert.equal(group.coverage.monthsWithData, 0);
    assert.match(group.coverage.note ?? "", /No Loan releases/);
  });
});

describe("computeCollectionTrend", () => {
  const base = inputs({
    schedules: [
      {
        id: "sch-1",
        masterlistId: "loan-1",
        dueDate: "2026-06-10",
        amountDue: 10_000,
        penaltyAmount: 500,
      },
    ],
    postings: [
      {
        scheduleId: "sch-1",
        masterlistId: "loan-1",
        amount: 8_400,
        postedAt: "2026-06-20T02:00:00.000Z",
      },
    ],
  });

  it("adds penalty to the amount that fell due", () => {
    const group = computeCollectionTrend(base, WINDOWS);
    assert.deepEqual(valuesOf(group, "collections.due"), [0, 0, 0, 10_500, 0, 0]);
  });

  it("computes efficiency against what was billed that month", () => {
    const group = computeCollectionTrend(base, WINDOWS);
    assert.deepEqual(valuesOf(group, "collections.efficiency"), [null, null, null, 80, null, null]);
  });

  it("leaves efficiency null rather than zero when nothing fell due", () => {
    const group = computeCollectionTrend(
      inputs({
        postings: [
          {
            scheduleId: null,
            masterlistId: "loan-1",
            amount: 5_000,
            postedAt: "2026-07-05T02:00:00.000Z",
          },
        ],
      }),
      WINDOWS,
    );
    assert.deepEqual(valuesOf(group, "collections.collected"), [0, 0, 0, 0, 5_000, 0]);
    assert.deepEqual(valuesOf(group, "collections.efficiency"), [null, null, null, null, null, null]);
  });
});

describe("computeApprovalTrend", () => {
  it("computes the rate from approve and deny only", () => {
    const group = computeApprovalTrend(
      [
        { action: "approve", actedAt: "2026-07-05T02:00:00.000Z" },
        { action: "approve", actedAt: "2026-07-11T02:00:00.000Z" },
        { action: "deny", actedAt: "2026-07-19T02:00:00.000Z" },
        { action: "revisit", actedAt: "2026-07-20T02:00:00.000Z" },
      ],
      WINDOWS,
    );
    assert.deepEqual(valuesOf(group, "approvals.rate"), [null, null, null, null, 66.7, null]);
    assert.deepEqual(valuesOf(group, "approvals.decisions"), [0, 0, 0, 0, 3, 0]);
    assert.deepEqual(valuesOf(group, "approvals.approved"), [0, 0, 0, 0, 2, 0]);
  });

  it("breaks the line in a month with no decisions instead of reporting zero percent", () => {
    const group = computeApprovalTrend(
      [{ action: "approve", actedAt: "2026-08-01T02:00:00.000Z" }],
      WINDOWS,
    );
    assert.deepEqual(valuesOf(group, "approvals.rate"), [null, null, null, null, null, 100]);
  });

  it("reports the true first month of decision history in coverage", () => {
    const group = computeApprovalTrend(
      [
        { action: "approve", actedAt: "2026-07-23T02:00:00.000Z" },
        { action: "deny", actedAt: "2026-08-18T02:00:00.000Z" },
      ],
      WINDOWS,
    );
    assert.equal(group.coverage.monthsWithData, 2);
    assert.equal(group.coverage.firstMonth, "2026-07");
    assert.match(group.coverage.note ?? "", /Committee decisions covers 2 of the last 6 months/);
  });
});
