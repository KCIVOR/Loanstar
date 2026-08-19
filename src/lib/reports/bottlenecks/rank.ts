/** One queue that work can pile up in, normalized across very different tables
 *  so the CEO sees "where is work stuck" rather than seven module-shaped lists. */
export type BottleneckEntry = {
  /** Stable key the brief can cite as evidence, e.g. `bottleneck.cig` */
  id: string;
  stage: string;
  /** Team that clears this queue */
  owner: string;
  /** Items currently waiting */
  count: number;
  /** Age of the oldest waiting item, in whole days */
  oldestDays: number;
  targetDays: number;
  breached: boolean;
  daysOverTarget: number;
};

export type BottleneckReport = {
  entries: BottleneckEntry[];
  worst: BottleneckEntry | null;
  totalWaiting: number;
  breachedStages: number;
};

export type RawBottleneck = Omit<
  BottleneckEntry,
  "breached" | "daysOverTarget"
>;

/**
 * Ranks by "how far past its own SLA is the oldest item", not by raw age or raw
 * count. A three-day-old item in a two-day queue is a worse signal than a
 * ten-day-old item in a queue we allow thirty days for, and counting alone would
 * always surface whichever team happens to handle the most volume.
 */
export function rankBottlenecks(raw: RawBottleneck[]): BottleneckReport {
  const entries: BottleneckEntry[] = raw
    .filter((entry) => entry.count > 0)
    .map((entry) => ({
      ...entry,
      breached: entry.targetDays > 0 && entry.oldestDays > entry.targetDays,
      daysOverTarget:
        entry.targetDays > 0 ? Math.max(0, entry.oldestDays - entry.targetDays) : 0,
    }))
    .sort((a, b) => {
      if (a.breached !== b.breached) return a.breached ? -1 : 1;
      if (a.daysOverTarget !== b.daysOverTarget) return b.daysOverTarget - a.daysOverTarget;
      return b.count - a.count;
    });

  return {
    entries,
    worst: entries[0] ?? null,
    totalWaiting: entries.reduce((sum, entry) => sum + entry.count, 0),
    breachedStages: entries.filter((entry) => entry.breached).length,
  };
}

/** Whole days from `at` until `now`; 0 when missing or in the future. */
export function ageInDays(at: string | null | undefined, now = new Date()): number {
  if (!at) return 0;
  const then = new Date(at).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

/** Count and oldest age for a set of waiting rows, in one pass. */
export function summarizeQueue(
  timestamps: Array<string | null | undefined>,
  now = new Date(),
): { count: number; oldestDays: number } {
  let oldestDays = 0;
  for (const at of timestamps) {
    const age = ageInDays(at, now);
    if (age > oldestDays) oldestDays = age;
  }
  return { count: timestamps.length, oldestDays };
}
