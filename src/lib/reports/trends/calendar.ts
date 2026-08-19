import type { Coverage, TrendPoint } from "./types";

/**
 * Trends need two things `bucketByMonth` in `src/lib/dashboard/buckets.ts`
 * does not give: a stable `YYYY-MM` key to join series on, and a month-END
 * boundary for as-of questions ("what was outstanding on 31 May", "which
 * schedules were unpaid by then"). Windows are derived once here and shared by
 * every trend module so all four groups line up index-for-index on a chart.
 */
export type MonthWindow = {
  /** `YYYY-MM` */
  key: string;
  /** Short display label, e.g. "Jun" */
  label: string;
  /** First instant of the month, inclusive */
  start: Date;
  /** First instant of the next month, exclusive — also the "as of" cutoff */
  end: Date;
};

const MONTH_LABEL = new Intl.DateTimeFormat("en-PH", { month: "short" });

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Trailing `months` calendar windows ending with the month containing `now`. */
export function monthWindows(months: number, now = new Date()): MonthWindow[] {
  const latest = new Date(now.getFullYear(), now.getMonth(), 1);
  const windows: MonthWindow[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const start = new Date(latest.getFullYear(), latest.getMonth() - i, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    windows.push({ key: monthKey(start), label: MONTH_LABEL.format(start), start, end });
  }
  return windows;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * `due_date` and `release_date` are Postgres `date` columns — calendar days,
 * not instants. `new Date("2026-08-01")` parses them as UTC midnight, which in
 * any negative-offset timezone lands on 31 July and silently moves the row into
 * the previous month. Parse those as local calendar days; leave real timestamps
 * alone.
 */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const dateOnly = DATE_ONLY.exec(value);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function inWindow(value: string | null | undefined, window: MonthWindow): boolean {
  const d = parseDate(value);
  return d !== null && d >= window.start && d < window.end;
}

/** True when `value` happened at or before the end of `window`. */
export function onOrBefore(value: string | null | undefined, window: MonthWindow): boolean {
  const d = parseDate(value);
  return d !== null && d < window.end;
}

/** Whole days from `value` to the end of `window`; negative when not yet due. */
export function daysLateAt(value: string | null | undefined, window: MonthWindow): number {
  const d = parseDate(value);
  if (!d) return 0;
  // Month end is exclusive, so the last real instant is one day back.
  const asOf = new Date(window.end.getTime() - 86_400_000);
  return Math.floor((asOf.getTime() - d.getTime()) / 86_400_000);
}

export function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function point(window: MonthWindow, value: number | null): TrendPoint {
  return { month: window.key, label: window.label, value };
}

/**
 * Coverage from the dates that back a group. A month counts as covered when at
 * least one source row falls inside it.
 */
export function buildCoverage(
  subject: string,
  windows: MonthWindow[],
  dates: Array<string | null | undefined>,
): Coverage {
  const covered = new Set<string>();
  let earliest: MonthWindow | null = null;
  for (const window of windows) {
    for (const date of dates) {
      if (!inWindow(date, window)) continue;
      covered.add(window.key);
      if (!earliest) earliest = window;
      break;
    }
  }

  const requestedMonths = windows.length;
  const monthsWithData = covered.size;
  const firstMonth = earliest?.key ?? null;
  const complete = monthsWithData >= requestedMonths;

  return {
    requestedMonths,
    monthsWithData,
    firstMonth,
    note: complete
      ? null
      : monthsWithData === 0
        ? `No ${subject} recorded in the last ${requestedMonths} months.`
        : `${subject} covers ${monthsWithData} of the last ${requestedMonths} months, starting ${firstMonth}.`,
  };
}
