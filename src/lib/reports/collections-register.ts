import type { MetricValue } from "./metrics/types";

import type { ReportSegment } from "./segments";

export type CollectionSegment = ReportSegment;

export type CollectorCollectionRow = {
  collectorUserId: string;
  name: string;
  amountCollected: number;
  dcrsSubmitted: number;
  dcrsReconciled: number;
  dcrsRejected: number;
  rejectionRatePct: number;
};

export type CollectorCollectionInput = {
  assignments: Array<{ masterlistId: string; collectorUserId: string | null }>;
  postings: Array<{ masterlistId: string; amount: number }>;
  dcrs: Array<{ collectorUserId: string | null; status: string }>;
  masterlistSegments: Array<{ id: string; segment: string | null }>;
  names: Map<string, string>;
  segment: CollectionSegment;
};

export const COLLECTION_METRIC_IDS = [
  "money.collected",
  "money.collectionEfficiency",
  "money.penaltyIncome",
] as const;

export function pickCollectionMetrics(metrics: MetricValue[]): MetricValue[] {
  const byId = new Map(metrics.map((m) => [m.id, m]));
  return COLLECTION_METRIC_IDS.map((id) => byId.get(id)).filter(
    (m): m is MetricValue => Boolean(m),
  );
}

export function buildCollectorCollections(
  input: CollectorCollectionInput,
): CollectorCollectionRow[] {
  const segmentByMasterlist = new Map(
    input.masterlistSegments.map((row) => [row.id, row.segment]),
  );
  const collectorByMasterlist = new Map<string, string>();
  const collectorsInSegment = new Set<string>();
  for (const row of input.assignments) {
    if (!row.collectorUserId) continue;
    collectorByMasterlist.set(row.masterlistId, row.collectorUserId);
    const accountSegment = segmentByMasterlist.get(row.masterlistId) ?? null;
    if (input.segment === "all" || accountSegment === input.segment) {
      collectorsInSegment.add(row.collectorUserId);
    }
  }

  const collectedByCollector = new Map<string, number>();
  for (const posting of input.postings) {
    const accountSegment = segmentByMasterlist.get(posting.masterlistId) ?? null;
    if (input.segment !== "all" && accountSegment !== input.segment) continue;
    const collectorId = collectorByMasterlist.get(posting.masterlistId);
    if (!collectorId) continue;
    collectedByCollector.set(
      collectorId,
      (collectedByCollector.get(collectorId) ?? 0) + posting.amount,
    );
  }

  const dcrByCollector = new Map<
    string,
    { submitted: number; reconciled: number; rejected: number }
  >();
  for (const row of input.dcrs) {
    const collectorId = row.collectorUserId;
    if (!collectorId || row.status === "draft") continue;
    const entry = dcrByCollector.get(collectorId) ?? {
      submitted: 0,
      reconciled: 0,
      rejected: 0,
    };
    entry.submitted += 1;
    if (row.status === "reconciled") entry.reconciled += 1;
    if (row.status === "rejected") entry.rejected += 1;
    dcrByCollector.set(collectorId, entry);
  }

  const collectorIds = new Set<string>([...collectedByCollector.keys()]);
  for (const id of dcrByCollector.keys()) {
    if (input.segment === "all" || collectorsInSegment.has(id)) collectorIds.add(id);
  }
  if (input.segment !== "all") {
    for (const id of collectorsInSegment) collectorIds.add(id);
  }

  const rows: CollectorCollectionRow[] = [...collectorIds].map((id) => {
    const dcr = dcrByCollector.get(id) ?? { submitted: 0, reconciled: 0, rejected: 0 };
    return {
      collectorUserId: id,
      name: input.names.get(id) ?? "Unknown",
      amountCollected: collectedByCollector.get(id) ?? 0,
      dcrsSubmitted: dcr.submitted,
      dcrsReconciled: dcr.reconciled,
      dcrsRejected: dcr.rejected,
      rejectionRatePct: dcr.submitted > 0 ? (dcr.rejected / dcr.submitted) * 100 : 0,
    };
  });

  rows.sort((a, b) => b.amountCollected - a.amountCollected);
  return rows;
}
