import { buildCoverage, inWindow, point, round, type MonthWindow } from "./calendar";
import type { TrendDecisionRow } from "./inputs";
import type { TrendGroup, TrendPoint } from "./types";

/**
 * Committee outcomes per month. Rate is null in a month with no decisions so
 * the line breaks instead of dropping to zero, which would read as "we approved
 * nobody" rather than "committee did not sit".
 *
 * Coverage matters more here than anywhere else: `committee_actions` only
 * begins 2026-07, so any window longer than that is mostly empty.
 */
export function computeApprovalTrend(
  decisions: TrendDecisionRow[],
  windows: MonthWindow[],
): TrendGroup {
  const rate: TrendPoint[] = [];
  const volume: TrendPoint[] = [];
  const approvedPoints: TrendPoint[] = [];

  for (const window of windows) {
    let approved = 0;
    let denied = 0;
    for (const decision of decisions) {
      if (!inWindow(decision.actedAt, window)) continue;
      if (decision.action === "approve") approved += 1;
      else if (decision.action === "deny") denied += 1;
    }
    const decided = approved + denied;
    rate.push(point(window, decided > 0 ? round((approved / decided) * 100, 1) : null));
    volume.push(point(window, decided));
    approvedPoints.push(point(window, approved));
  }

  return {
    id: "approvals",
    label: "Approval trend",
    series: [
      { id: "approvals.rate", label: "Approval rate", unit: "percent", points: rate },
      { id: "approvals.decisions", label: "Decisions made", unit: "count", points: volume },
      { id: "approvals.approved", label: "Approved", unit: "count", points: approvedPoints },
    ],
    coverage: buildCoverage(
      "Committee decisions",
      windows,
      decisions.map((decision) => decision.actedAt),
    ),
  };
}
