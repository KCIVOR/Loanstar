import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceClient } from "@/lib/supabase/server";

export type CollectorScorecardRow = {
  collectorUserId: string;
  name: string;
  accountsHeld: number;
  amountCollected: number;
  dcrsSubmitted: number;
  dcrsReconciled: number;
  dcrsRejected: number;
  rejectionRatePct: number;
  avgCycleDays: number | null;
};

export type CommitteeParticipationRow = {
  voterId: string;
  name: string;
  votesCast: number;
  avgTurnaroundDays: number | null;
};

export type ProofBacklogBucket = { label: string; count: number };

export type StaffSeries = {
  collectorScorecard: CollectorScorecardRow[];
  committeeParticipation: CommitteeParticipationRow[];
  proofBacklog: ProofBacklogBucket[];
};

function daysBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24);
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
}

async function resolveNames(userIds: string[]): Promise<Map<string, string>> {
  const nameById = new Map<string, string>();
  if (!userIds.length) return nameById;
  // `profiles` RLS only allows reading your own row — resolve display names
  // via the service role, same gap fixed elsewhere for CIG/Committee/AR.
  const admin = createServiceClient();
  const { data } = await admin
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds);
  for (const p of data ?? []) {
    nameById.set(p.id as string, (p.full_name as string) || (p.email as string) || "Unknown");
  }
  return nameById;
}

export async function computeStaffMetrics(supabase: SupabaseClient): Promise<StaffSeries> {
  const [
    { data: assignments, error: assignError },
    { data: postings, error: postingsError },
    { data: dcrRows, error: dcrError },
    { data: pendingProofs, error: proofsError },
    { data: votes, error: votesError },
    { data: applications, error: appsError },
  ] = await Promise.all([
    supabase.from("assignments").select("masterlist_id, collector_user_id"),
    supabase.from("postings").select("masterlist_id, amount"),
    supabase.from("dcr").select("collector_user_id, status, submitted_at, reconciled_at"),
    supabase.from("payments").select("created_at").eq("status", "pending_verification"),
    supabase.from("committee_votes").select("voter_id, voted_at, loan_application_id"),
    supabase.from("loan_applications").select("id, status_history"),
  ]);

  if (assignError) throw new Error(assignError.message);
  if (postingsError) throw new Error(postingsError.message);
  if (dcrError) throw new Error(dcrError.message);
  if (proofsError) throw new Error(proofsError.message);
  if (votesError) throw new Error(votesError.message);
  if (appsError) throw new Error(appsError.message);

  // --- Collector scorecard --------------------------------------------
  const collectorByMasterlist = new Map<string, string>();
  const accountsHeldByCollector = new Map<string, number>();
  for (const row of assignments ?? []) {
    const collectorId = row.collector_user_id as string | null;
    if (!collectorId) continue;
    collectorByMasterlist.set(row.masterlist_id as string, collectorId);
    accountsHeldByCollector.set(collectorId, (accountsHeldByCollector.get(collectorId) ?? 0) + 1);
  }

  const collectedByCollector = new Map<string, number>();
  for (const row of postings ?? []) {
    const collectorId = collectorByMasterlist.get(row.masterlist_id as string);
    if (!collectorId) continue;
    collectedByCollector.set(
      collectorId,
      (collectedByCollector.get(collectorId) ?? 0) + Number(row.amount),
    );
  }

  const dcrByCollector = new Map<
    string,
    { submitted: number; reconciled: number; rejected: number; cycleDays: number[] }
  >();
  for (const row of dcrRows ?? []) {
    const collectorId = row.collector_user_id as string | null;
    const status = row.status as string;
    if (!collectorId || status === "draft") continue;
    const entry = dcrByCollector.get(collectorId) ?? {
      submitted: 0,
      reconciled: 0,
      rejected: 0,
      cycleDays: [],
    };
    entry.submitted += 1;
    if (status === "reconciled") {
      entry.reconciled += 1;
      if (row.submitted_at && row.reconciled_at) {
        entry.cycleDays.push(daysBetween(row.submitted_at as string, row.reconciled_at as string));
      }
    }
    if (status === "rejected") entry.rejected += 1;
    dcrByCollector.set(collectorId, entry);
  }

  const collectorIds = new Set<string>([
    ...accountsHeldByCollector.keys(),
    ...dcrByCollector.keys(),
  ]);
  const collectorNames = await resolveNames(Array.from(collectorIds));

  const collectorScorecard: CollectorScorecardRow[] = Array.from(collectorIds).map((id) => {
    const dcr = dcrByCollector.get(id) ?? { submitted: 0, reconciled: 0, rejected: 0, cycleDays: [] };
    return {
      collectorUserId: id,
      name: collectorNames.get(id) ?? "Unknown",
      accountsHeld: accountsHeldByCollector.get(id) ?? 0,
      amountCollected: collectedByCollector.get(id) ?? 0,
      dcrsSubmitted: dcr.submitted,
      dcrsReconciled: dcr.reconciled,
      dcrsRejected: dcr.rejected,
      rejectionRatePct: dcr.submitted > 0 ? (dcr.rejected / dcr.submitted) * 100 : 0,
      avgCycleDays: mean(dcr.cycleDays),
    };
  });
  collectorScorecard.sort((a, b) => b.amountCollected - a.amountCollected);

  // --- Committee participation -------------------------------------------
  const forApprovalAtByApplication = new Map<string, string>();
  for (const app of applications ?? []) {
    const history = (app.status_history as Array<{ status: string; at: string }> | null) ?? [];
    const entry = history.find((e) => e.status === "for_approval");
    if (entry) forApprovalAtByApplication.set(app.id as string, entry.at);
  }

  const committeeByVoter = new Map<string, { votes: number; turnarounds: number[] }>();
  for (const row of votes ?? []) {
    const voterId = row.voter_id as string;
    const entry = committeeByVoter.get(voterId) ?? { votes: 0, turnarounds: [] };
    entry.votes += 1;
    const forApprovalAt = forApprovalAtByApplication.get(row.loan_application_id as string);
    if (forApprovalAt && row.voted_at) {
      entry.turnarounds.push(daysBetween(forApprovalAt, row.voted_at as string));
    }
    committeeByVoter.set(voterId, entry);
  }
  const voterNames = await resolveNames(Array.from(committeeByVoter.keys()));

  const committeeParticipation: CommitteeParticipationRow[] = Array.from(
    committeeByVoter.entries(),
  ).map(([voterId, entry]) => ({
    voterId,
    name: voterNames.get(voterId) ?? "Unknown",
    votesCast: entry.votes,
    avgTurnaroundDays: mean(entry.turnarounds),
  }));
  committeeParticipation.sort((a, b) => b.votesCast - a.votesCast);

  // --- Proof-verification backlog -----------------------------------------
  const now = Date.now();
  const buckets = { "0-1d": 0, "2-3d": 0, "4-7d": 0, "7d+": 0 };
  for (const row of pendingProofs ?? []) {
    const ageDays = (now - new Date(row.created_at as string).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays <= 1) buckets["0-1d"] += 1;
    else if (ageDays <= 3) buckets["2-3d"] += 1;
    else if (ageDays <= 7) buckets["4-7d"] += 1;
    else buckets["7d+"] += 1;
  }
  const proofBacklog: ProofBacklogBucket[] = Object.entries(buckets).map(([label, count]) => ({
    label,
    count,
  }));

  return { collectorScorecard, committeeParticipation, proofBacklog };
}
