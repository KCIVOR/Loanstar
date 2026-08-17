import type { Period } from "./metrics/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** `iso` is a "YYYY-MM-DD" date; parsed as UTC midnight to avoid local-timezone drift. */
function toUtcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDaysUtc(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_PER_DAY);
}

/** Inclusive day count between `from` and `to`. */
function periodLengthDays(period: Period): number {
  const from = toUtcDate(period.from);
  const to = toUtcDate(period.to);
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY) + 1;
}

/**
 * Reads `from`/`to` ("YYYY-MM-DD") off `searchParams` when both are present;
 * otherwise defaults to the current month-to-date.
 */
export function parsePeriod(searchParams: URLSearchParams): Period {
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  if (fromParam && toParam) {
    return { from: fromParam, to: toParam };
  }

  const now = new Date();
  const to = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  return { from: toIsoDate(from), to: toIsoDate(to) };
}

export type PeriodPreset = "mtd" | "qtd" | "ytd" | "last12m";

export const PERIOD_PRESETS: Array<{ id: PeriodPreset; label: string }> = [
  { id: "mtd", label: "Month to date" },
  { id: "qtd", label: "Quarter to date" },
  { id: "ytd", label: "Year to date" },
  { id: "last12m", label: "Last 12 months" },
];

/** Builds a named preset period ending today. */
export function presetPeriod(preset: PeriodPreset, now: Date = new Date()): Period {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let from: Date;
  switch (preset) {
    case "mtd":
      from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      break;
    case "qtd": {
      const quarterStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;
      from = new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth, 1));
      break;
    }
    case "ytd":
      from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      break;
    case "last12m":
      from = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate() + 1));
      break;
  }
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

/** Same length as `p`, ending the day immediately before `p.from`. */
export function priorPeriod(p: Period): Period {
  const length = periodLengthDays(p);
  const priorTo = addDaysUtc(toUtcDate(p.from), -1);
  const priorFrom = addDaysUtc(priorTo, -(length - 1));
  return { from: toIsoDate(priorFrom), to: toIsoDate(priorTo) };
}

/**
 * `deltaPct` is null (never Infinity/NaN) when there is no prior value or
 * the prior value is zero — a percent change from zero is undefined.
 */
export function computeDelta(
  value: number,
  prior: number | null,
): { deltaAbs: number | null; deltaPct: number | null } {
  if (prior === null) {
    return { deltaAbs: null, deltaPct: null };
  }
  const deltaAbs = value - prior;
  const deltaPct = prior === 0 ? null : (deltaAbs / prior) * 100;
  return { deltaAbs, deltaPct };
}
