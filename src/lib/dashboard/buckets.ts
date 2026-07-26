/** Pure date-bucketing helpers for dashboard widget series.
 *
 * supabase-js cannot GROUP BY, so aggregates fetch minimal columns with a
 * date cutoff and bucket rows here.
 */

export type SeriesPoint = {
  /** Short display label, e.g. "Jun 1" or "Jun" */
  label: string;
  /** ISO date of the bucket start (inclusive) */
  start: string;
  count: number;
  total: number;
};

type Row = { at: string | null; value?: number | null };

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Monday-based start of week. */
function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  const offset = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - offset);
  return day;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

const DAY_LABEL = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
});
const MONTH_LABEL = new Intl.DateTimeFormat("en-PH", { month: "short" });

function buildBuckets(
  rows: Row[],
  starts: Date[],
  next: (d: Date) => Date,
  label: (d: Date) => string,
): SeriesPoint[] {
  return starts.map((start) => {
    const end = next(start);
    let count = 0;
    let total = 0;
    for (const row of rows) {
      if (!row.at) continue;
      const t = new Date(row.at);
      if (t >= start && t < end) {
        count += 1;
        total += Number(row.value ?? 0);
      }
    }
    return {
      label: label(start),
      start: start.toISOString(),
      count,
      total: Math.round(total * 100) / 100,
    };
  });
}

/** Buckets rows into the trailing `weeks` Monday-based weeks ending at `now`. */
export function bucketByWeek(rows: Row[], weeks: number, now = new Date()): SeriesPoint[] {
  const starts: Date[] = [];
  const latest = startOfWeek(now);
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(latest);
    d.setDate(d.getDate() - i * 7);
    starts.push(d);
  }
  return buildBuckets(
    rows,
    starts,
    (d) => {
      const n = new Date(d);
      n.setDate(n.getDate() + 7);
      return n;
    },
    (d) => DAY_LABEL.format(d),
  );
}

/** Buckets rows into the trailing `months` calendar months ending at `now`. */
export function bucketByMonth(rows: Row[], months: number, now = new Date()): SeriesPoint[] {
  const starts: Date[] = [];
  const latest = startOfMonth(now);
  for (let i = months - 1; i >= 0; i--) {
    starts.push(new Date(latest.getFullYear(), latest.getMonth() - i, 1));
  }
  return buildBuckets(
    rows,
    starts,
    (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1),
    (d) => MONTH_LABEL.format(d),
  );
}

/** Buckets rows into the trailing `days` calendar days ending at `now`. */
export function bucketByDay(rows: Row[], days: number, now = new Date()): SeriesPoint[] {
  const starts: Date[] = [];
  const latest = startOfDay(now);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(latest);
    d.setDate(d.getDate() - i);
    starts.push(d);
  }
  return buildBuckets(
    rows,
    starts,
    (d) => {
      const n = new Date(d);
      n.setDate(n.getDate() + 1);
      return n;
    },
    (d) => DAY_LABEL.format(d),
  );
}

/** Average whole days between two timestamps across rows; null when empty. */
export function averageDays(
  pairs: Array<{ from: string | null; to: string | null }>,
): { averageDays: number | null; sampleCount: number } {
  const durations: number[] = [];
  for (const p of pairs) {
    if (!p.from || !p.to) continue;
    const days = (new Date(p.to).getTime() - new Date(p.from).getTime()) / 86_400_000;
    if (Number.isFinite(days) && days >= 0) durations.push(days);
  }
  if (durations.length === 0) return { averageDays: null, sampleCount: 0 };
  const avg = durations.reduce((s, d) => s + d, 0) / durations.length;
  return { averageDays: Math.round(avg * 10) / 10, sampleCount: durations.length };
}

/** Cutoff ISO string `n` days before now — for `.gte()` query filters. */
export function daysAgoIso(n: number, now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}
