import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { monthWindows } from "../calendar";
import { computeDelinquencyTrend } from "../delinquency";
import type { TrendInputs, TrendPostingRow } from "../inputs";

const NOW = new Date(2026, 7, 19);
const WINDOWS = monthWindows(6, NOW); // 2026-03 .. 2026-08

/** Book worth 100k every month, so PAR reads back as a round percentage. */
const OUTSTANDING = new Map(WINDOWS.map((w) => [w.key, 100_000]));

function inputs(postings: TrendPostingRow[]): TrendInputs {
  return {
    loans: [
      { id: "loan-1", totalLoan: 100_000, releaseDate: "2026-03-15", accountStatus: "active" },
    ],
    schedules: [
      {
        id: "sch-1",
        masterlistId: "loan-1",
        dueDate: "2026-04-10",
        amountDue: 10_000,
        penaltyAmount: 0,
      },
    ],
    postings,
    decisions: [],
  };
}

function valuesOf(
  group: ReturnType<typeof computeDelinquencyTrend>,
  seriesId: string,
): Array<number | null> {
  const series = group.series.find((s) => s.id === seriesId);
  assert.ok(series, `missing series ${seriesId}`);
  return series.points.map((p) => p.value);
}

describe("computeDelinquencyTrend", () => {
  it("ages an unpaid installment through the buckets month by month", () => {
    const group = computeDelinquencyTrend(inputs([]), WINDOWS, OUTSTANDING);
    const buckets = group.snapshots.map((s) => s.buckets);

    assert.deepEqual(buckets[0], { "1-30": 0, "31-60": 0, "61-90": 0, "91+": 0 }); // Mar, not due
    assert.equal(buckets[1]!["1-30"], 10_000); // Apr, 20 days late
    assert.equal(buckets[2]!["31-60"], 10_000); // May, 51 days
    assert.equal(buckets[3]!["61-90"], 10_000); // Jun, 81 days
    assert.equal(buckets[4]!["91+"], 10_000); // Jul, 112 days
  });

  it("only counts debt past 30 days in PAR30, and past 90 in PAR90", () => {
    const group = computeDelinquencyTrend(inputs([]), WINDOWS, OUTSTANDING);
    assert.deepEqual(valuesOf(group, "delinquency.par30"), [0, 0, 10, 10, 10, 10]);
    assert.deepEqual(valuesOf(group, "delinquency.par90"), [0, 0, 0, 0, 10, 10]);
  });

  it("clears the arrear in the month the payment lands, not retroactively", () => {
    const group = computeDelinquencyTrend(
      inputs([
        {
          scheduleId: "sch-1",
          masterlistId: "loan-1",
          amount: 10_000,
          postedAt: "2026-05-15T02:00:00.000Z",
        },
      ]),
      WINDOWS,
      OUTSTANDING,
    );
    const overdue = valuesOf(group, "delinquency.overdue");
    assert.equal(overdue[1], 10_000, "April was genuinely late");
    assert.deepEqual(overdue.slice(2), [0, 0, 0, 0], "May onward is settled");
  });

  it("waterfalls a payment that names no installment onto the oldest debt", () => {
    const group = computeDelinquencyTrend(
      inputs([
        {
          scheduleId: null,
          masterlistId: "loan-1",
          amount: 10_000,
          postedAt: "2026-05-15T02:00:00.000Z",
        },
      ]),
      WINDOWS,
      OUTSTANDING,
    );
    assert.deepEqual(valuesOf(group, "delinquency.overdue"), [0, 10_000, 0, 0, 0, 0]);
  });

  it("treats a partial payment as a partial arrear", () => {
    const group = computeDelinquencyTrend(
      inputs([
        {
          scheduleId: "sch-1",
          masterlistId: "loan-1",
          amount: 4_000,
          postedAt: "2026-05-15T02:00:00.000Z",
        },
      ]),
      WINDOWS,
      OUTSTANDING,
    );
    assert.deepEqual(valuesOf(group, "delinquency.overdue"), [0, 10_000, 6_000, 6_000, 6_000, 6_000]);
    assert.deepEqual(valuesOf(group, "delinquency.par30"), [0, 0, 6, 6, 6, 6]);
  });

  it("counts distinct late accounts, not late installments", () => {
    const base = inputs([]);
    const group = computeDelinquencyTrend(
      {
        ...base,
        schedules: [
          ...base.schedules,
          {
            id: "sch-2",
            masterlistId: "loan-1",
            dueDate: "2026-05-10",
            amountDue: 10_000,
            penaltyAmount: 0,
          },
        ],
      },
      WINDOWS,
      OUTSTANDING,
    );
    assert.equal(group.snapshots[2]!.overdueAccounts, 1);
    assert.equal(group.snapshots[2]!.overdueTotal, 20_000);
  });

  it("leaves PAR null when there is no book to measure against", () => {
    const group = computeDelinquencyTrend(inputs([]), WINDOWS, new Map());
    assert.deepEqual(valuesOf(group, "delinquency.par30"), [null, null, null, null, null, null]);
  });
});
