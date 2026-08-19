import type { SupabaseClient } from "@supabase/supabase-js";

import { formatStatusLabel } from "@/lib/applications/status";
import type { StuckFile } from "@/lib/reports/metrics/origination";

import { rankBottlenecks, type BottleneckReport, type RawBottleneck } from "./rank";
import { fetchQueueSources } from "./sources";

/**
 * Origination already knows which applications have overstayed their stage SLA;
 * it just reports them as a flat list of files. Rolled up per status they
 * become comparable to the other queues: "4 files sitting at Committee review,
 * oldest 12 days against a 3-day target".
 */
export function groupStuckFiles(stuckFiles: StuckFile[]): RawBottleneck[] {
  const byStatus = new Map<string, { count: number; oldestDays: number; targetDays: number }>();
  for (const file of stuckFiles) {
    const entry = byStatus.get(file.status) ?? {
      count: 0,
      oldestDays: 0,
      targetDays: file.targetDays,
    };
    entry.count += 1;
    entry.oldestDays = Math.max(entry.oldestDays, file.daysInStatus);
    byStatus.set(file.status, entry);
  }

  return Array.from(byStatus.entries()).map(([status, entry]) => ({
    id: `bottleneck.stage.${status}`,
    stage: `Stuck at ${formatStatusLabel(status)}`,
    owner: "Origination",
    count: entry.count,
    oldestDays: Math.round(entry.oldestDays),
    targetDays: entry.targetDays,
  }));
}

export async function buildBottleneckReport(
  supabase: SupabaseClient,
  stuckFiles: StuckFile[],
  now = new Date(),
): Promise<BottleneckReport> {
  const queues = await fetchQueueSources(supabase, now);
  return rankBottlenecks([...queues, ...groupStuckFiles(stuckFiles)]);
}

export { rankBottlenecks, summarizeQueue, ageInDays } from "./rank";
export { QUEUE_TARGET_DAYS } from "./sources";
export type { BottleneckEntry, BottleneckReport, RawBottleneck } from "./rank";
