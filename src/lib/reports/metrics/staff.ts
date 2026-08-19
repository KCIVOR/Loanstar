import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchAllRows } from "@/lib/reports/paginate";
import { createServiceClient } from "@/lib/supabase/server";

import {
  buildAgentScorecard,
  buildCigScorecard,
  buildLraScorecard,
  buildRemedialScorecard,
  daysBetween,
  mean,
  withinPeriod,
  type AgentScorecardRow,
  type CheckRow,
  type CigScorecardRow,
  type LeadRow,
  type LraScorecardRow,
  type ReleaseFileRow,
  type RemedialScorecardRow,
  type TurnoverRow,
  type VerificationRow,
} from "./staff-scorecards";
import type { Period } from "./types";

export type CollectorScorecardRow = {
  collectorUserId: string;
  name: string;
  accountsHeld: number;
  /** Scoped to the requested period when one is given, otherwise all-time. */
  amountCollected: number;
  /** Always all-time, so the panel keeps a stable lifetime figure. */
  amountCollectedAllTime: number;
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
  agentScorecard: AgentScorecardRow[];
  cigScorecard: CigScorecardRow[];
  lraScorecard: LraScorecardRow[];
  remedialScorecard: RemedialScorecardRow[];
};

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

type AssignmentRow = {
  masterlist_id: string;
  collector_user_id: string | null;
  remedial_user_id: string | null;
};
type PostingRow = { masterlist_id: string; amount: number | null; posted_at: string | null };
type DcrRow = {
  collector_user_id: string | null;
  status: string | null;
  submitted_at: string | null;
  reconciled_at: string | null;
};
type PaymentRow = { status: string | null; created_at: string | null };
type VoteRow = { voter_id: string; voted_at: string | null; loan_application_id: string };
type ApplicationRow = {
  id: string;
  status: string | null;
  status_history: Array<{ status: string; at: string }> | null;
};
/**
 * Staff performance across every team that touches a file.
 *
 * `period` is optional and backward compatible: without it this behaves exactly
 * as it did when only collectors and Committee were covered. With it, the
 * per-person figures answer "how did they do this period" instead of quietly
 * reporting lifetime totals against a period-scoped page.
 */
export async function computeStaffMetrics(
  supabase: SupabaseClient,
  period?: Period,
): Promise<StaffSeries> {
  const [
    assignments,
    postings,
    dcrRows,
    payments,
    votes,
    applications,
    leads,
    verifications,
    checks,
    releaseFiles,
    turnovers,
  ] = await Promise.all([
    fetchAllRows<AssignmentRow>(supabase, {
      table: "assignments",
      columns: "masterlist_id, collector_user_id, remedial_user_id",
      order: "id",
    }),
    fetchAllRows<PostingRow>(supabase, {
      table: "postings",
      columns: "masterlist_id, amount, posted_at",
      order: "id",
    }),
    fetchAllRows<DcrRow>(supabase, {
      table: "dcr",
      columns: "collector_user_id, status, submitted_at, reconciled_at",
      order: "id",
    }),
    fetchAllRows<PaymentRow>(supabase, {
      table: "payments",
      columns: "status, created_at",
      order: "id",
    }),
    fetchAllRows<VoteRow>(supabase, {
      table: "committee_votes",
      columns: "voter_id, voted_at, loan_application_id",
      order: "id",
    }),
    fetchAllRows<ApplicationRow>(supabase, {
      table: "loan_applications",
      columns: "id, status, status_history",
      order: "id",
    }),
    fetchAllRows<LeadRow>(supabase, {
      table: "leads",
      columns: "agent_user_id, application_id, created_at",
      order: "id",
    }),
    fetchAllRows<VerificationRow>(supabase, {
      table: "verifications",
      columns: "completed_by, is_complete, created_at, completed_at",
      order: "id",
    }),
    fetchAllRows<CheckRow>(supabase, {
      table: "checks_recorded",
      columns: "checked_by, result, checked_at",
      order: "id",
    }),
    fetchAllRows<ReleaseFileRow>(supabase, {
      table: "release_files",
      columns: "assigned_to, status, created_at, updated_at",
      order: "id",
    }),
    fetchAllRows<TurnoverRow>(supabase, {
      table: "remedial_turnovers",
      columns: "masterlist_id, to_remedial_user_id, confirmed_at",
      order: "id",
    }),
  ]);

  // --- Collector scorecard --------------------------------------------
  const collectorByMasterlist = new Map<string, string>();
  const accountsHeldByCollector = new Map<string, number>();
  for (const row of assignments) {
    const collectorId = row.collector_user_id;
    if (!collectorId) continue;
    collectorByMasterlist.set(row.masterlist_id, collectorId);
    accountsHeldByCollector.set(collectorId, (accountsHeldByCollector.get(collectorId) ?? 0) + 1);
  }

  const collectedByCollector = new Map<string, number>();
  const collectedAllTimeByCollector = new Map<string, number>();
  for (const row of postings) {
    const collectorId = collectorByMasterlist.get(row.masterlist_id);
    if (!collectorId) continue;
    const amount = Number(row.amount ?? 0);
    collectedAllTimeByCollector.set(
      collectorId,
      (collectedAllTimeByCollector.get(collectorId) ?? 0) + amount,
    );
    if (withinPeriod(row.posted_at, period)) {
      collectedByCollector.set(collectorId, (collectedByCollector.get(collectorId) ?? 0) + amount);
    }
  }

  const dcrByCollector = new Map<
    string,
    { submitted: number; reconciled: number; rejected: number; cycleDays: number[] }
  >();
  for (const row of dcrRows) {
    const collectorId = row.collector_user_id;
    const status = row.status ?? "";
    if (!collectorId || status === "draft") continue;
    if (!withinPeriod(row.submitted_at, period)) continue;
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
        entry.cycleDays.push(daysBetween(row.submitted_at, row.reconciled_at));
      }
    }
    if (status === "rejected") entry.rejected += 1;
    dcrByCollector.set(collectorId, entry);
  }

  // --- Committee participation -------------------------------------------
  const forApprovalAtByApplication = new Map<string, string>();
  const statusByApplication = new Map<string, string>();
  for (const app of applications) {
    statusByApplication.set(app.id, app.status ?? "");
    const entry = (app.status_history ?? []).find((e) => e.status === "for_approval");
    if (entry) forApprovalAtByApplication.set(app.id, entry.at);
  }

  const committeeByVoter = new Map<string, { votes: number; turnarounds: number[] }>();
  for (const row of votes) {
    if (!withinPeriod(row.voted_at, period)) continue;
    const entry = committeeByVoter.get(row.voter_id) ?? { votes: 0, turnarounds: [] };
    entry.votes += 1;
    const forApprovalAt = forApprovalAtByApplication.get(row.loan_application_id);
    if (forApprovalAt && row.voted_at) {
      entry.turnarounds.push(daysBetween(forApprovalAt, row.voted_at));
    }
    committeeByVoter.set(row.voter_id, entry);
  }

  // --- One name lookup for every team -------------------------------------
  const userIds = new Set<string>([
    ...accountsHeldByCollector.keys(),
    ...dcrByCollector.keys(),
    ...committeeByVoter.keys(),
  ]);
  for (const row of assignments) if (row.remedial_user_id) userIds.add(row.remedial_user_id);
  for (const row of leads) if (row.agent_user_id) userIds.add(row.agent_user_id);
  for (const row of verifications) if (row.completed_by) userIds.add(row.completed_by);
  for (const row of checks) if (row.checked_by) userIds.add(row.checked_by);
  for (const row of releaseFiles) if (row.assigned_to) userIds.add(row.assigned_to);
  for (const row of turnovers) if (row.to_remedial_user_id) userIds.add(row.to_remedial_user_id);
  const names = await resolveNames(Array.from(userIds));

  const collectorIds = new Set<string>([
    ...accountsHeldByCollector.keys(),
    ...dcrByCollector.keys(),
  ]);
  const collectorScorecard: CollectorScorecardRow[] = Array.from(collectorIds).map((id) => {
    const dcr = dcrByCollector.get(id) ?? {
      submitted: 0,
      reconciled: 0,
      rejected: 0,
      cycleDays: [],
    };
    return {
      collectorUserId: id,
      name: names.get(id) ?? "Unknown",
      accountsHeld: accountsHeldByCollector.get(id) ?? 0,
      amountCollected: collectedByCollector.get(id) ?? 0,
      amountCollectedAllTime: collectedAllTimeByCollector.get(id) ?? 0,
      dcrsSubmitted: dcr.submitted,
      dcrsReconciled: dcr.reconciled,
      dcrsRejected: dcr.rejected,
      rejectionRatePct: dcr.submitted > 0 ? (dcr.rejected / dcr.submitted) * 100 : 0,
      avgCycleDays: mean(dcr.cycleDays),
    };
  });
  collectorScorecard.sort((a, b) => b.amountCollected - a.amountCollected);

  const committeeParticipation: CommitteeParticipationRow[] = Array.from(
    committeeByVoter.entries(),
  ).map(([voterId, entry]) => ({
    voterId,
    name: names.get(voterId) ?? "Unknown",
    votesCast: entry.votes,
    avgTurnaroundDays: mean(entry.turnarounds),
  }));
  committeeParticipation.sort((a, b) => b.votesCast - a.votesCast);

  // --- Proof-verification backlog -----------------------------------------
  const now = Date.now();
  const buckets = { "0-1d": 0, "2-3d": 0, "4-7d": 0, "7d+": 0 };
  for (const row of payments) {
    if (row.status !== "pending_verification" || !row.created_at) continue;
    const ageDays = (now - new Date(row.created_at).getTime()) / 86_400_000;
    if (ageDays <= 1) buckets["0-1d"] += 1;
    else if (ageDays <= 3) buckets["2-3d"] += 1;
    else if (ageDays <= 7) buckets["4-7d"] += 1;
    else buckets["7d+"] += 1;
  }
  const proofBacklog: ProofBacklogBucket[] = Object.entries(buckets).map(([label, count]) => ({
    label,
    count,
  }));

  return {
    collectorScorecard,
    committeeParticipation,
    proofBacklog,
    agentScorecard: buildAgentScorecard(leads, statusByApplication, names, period),
    cigScorecard: buildCigScorecard(verifications, checks, names, period),
    lraScorecard: buildLraScorecard(releaseFiles, names, period),
    remedialScorecard: buildRemedialScorecard(
      assignments,
      turnovers,
      postings,
      names,
      period,
    ),
  };
}
