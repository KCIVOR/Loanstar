import { buildCoverage, inWindow, point, round, type MonthWindow } from "./calendar";
import type { TrendInputs } from "./inputs";
import type { TrendGroup, TrendPoint } from "./types";

/**
 * Cash in versus what fell due, month by month. Efficiency is deliberately null
 * rather than 0 in a month where nothing was due — a month with no billing is
 * not a month of total collection failure, and a zero would read as one on the
 * chart.
 */
export function computeCollectionTrend(
  inputs: TrendInputs,
  windows: MonthWindow[],
): TrendGroup {
  const collected: TrendPoint[] = [];
  const due: TrendPoint[] = [];
  const efficiency: TrendPoint[] = [];

  for (const window of windows) {
    let collectedInMonth = 0;
    for (const posting of inputs.postings) {
      if (inWindow(posting.postedAt, window)) collectedInMonth += posting.amount;
    }

    let dueInMonth = 0;
    for (const schedule of inputs.schedules) {
      if (inWindow(schedule.dueDate, window)) {
        dueInMonth += schedule.amountDue + schedule.penaltyAmount;
      }
    }

    collected.push(point(window, round(collectedInMonth)));
    due.push(point(window, round(dueInMonth)));
    efficiency.push(
      point(window, dueInMonth > 0 ? round((collectedInMonth / dueInMonth) * 100, 1) : null),
    );
  }

  return {
    id: "collections",
    label: "Collection performance",
    series: [
      { id: "collections.collected", label: "Collected", unit: "php", points: collected },
      { id: "collections.due", label: "Fell due", unit: "php", points: due },
      { id: "collections.efficiency", label: "Collection efficiency", unit: "percent", points: efficiency },
    ],
    coverage: buildCoverage(
      "Posted collections",
      windows,
      inputs.postings.map((posting) => posting.postedAt),
    ),
  };
}
