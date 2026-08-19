import type { Period } from "./types";

/**
 * Pure scorecard builders for the teams the reports module never covered:
 * agents, CIG, LRA and remedial. Each takes rows exactly as Supabase returns
 * them plus a resolved name map, so `staff.ts` stays a fetch-and-compose layer
 * and every rule below is testable with fixtures.
 */

export function mean(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
}

export function daysBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
}

/** ISO timestamps compare correctly as strings once trimmed to the date, which
 *  keeps period filtering free of timezone drift. */
export function withinPeriod(at: string | null | undefined, period?: Period): boolean {
  if (!period) return true;
  if (!at) return false;
  const day = at.slice(0, 10);
  return day >= period.from && day <= period.to;
}

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null;
}

function nameOf(names: Map<string, string>, id: string): string {
  return names.get(id) ?? "Unknown";
}

// --- Agents ---------------------------------------------------------------

export type AgentScorecardRow = {
  agentUserId: string;
  name: string;
  leadsCreated: number;
  leadsConverted: number;
  conversionRatePct: number | null;
};

export type LeadRow = {
  agent_user_id: string | null;
  application_id: string | null;
  created_at: string | null;
};

/** A lead counts as converted once its application reached a released state —
 *  an application that merely exists is not a win. */
const CONVERTED_APPLICATION_STATUSES = new Set([
  "released",
  "closed",
  "loan_active",
  "paid_off",
]);

export function buildAgentScorecard(
  leads: LeadRow[],
  applicationStatusById: Map<string, string>,
  names: Map<string, string>,
  period?: Period,
): AgentScorecardRow[] {
  const byAgent = new Map<string, { created: number; converted: number }>();
  for (const lead of leads) {
    if (!lead.agent_user_id) continue;
    if (!withinPeriod(lead.created_at, period)) continue;
    const entry = byAgent.get(lead.agent_user_id) ?? { created: 0, converted: 0 };
    entry.created += 1;
    const status = lead.application_id
      ? applicationStatusById.get(lead.application_id)
      : undefined;
    if (status && CONVERTED_APPLICATION_STATUSES.has(status)) entry.converted += 1;
    byAgent.set(lead.agent_user_id, entry);
  }

  return Array.from(byAgent.entries())
    .map(([agentUserId, entry]) => ({
      agentUserId,
      name: nameOf(names, agentUserId),
      leadsCreated: entry.created,
      leadsConverted: entry.converted,
      conversionRatePct: rate(entry.converted, entry.created),
    }))
    .sort((a, b) => b.leadsConverted - a.leadsConverted);
}

// --- Credit investigation -------------------------------------------------

export type CigScorecardRow = {
  userId: string;
  name: string;
  verificationsCompleted: number;
  avgDaysToComplete: number | null;
  checksRecorded: number;
  checkPassRatePct: number | null;
};

export type VerificationRow = {
  completed_by: string | null;
  is_complete: boolean | null;
  created_at: string | null;
  completed_at: string | null;
};

export type CheckRow = {
  checked_by: string | null;
  result: string | null;
  checked_at: string | null;
};

export function buildCigScorecard(
  verifications: VerificationRow[],
  checks: CheckRow[],
  names: Map<string, string>,
  period?: Period,
): CigScorecardRow[] {
  const byUser = new Map<
    string,
    { completed: number; durations: number[]; checks: number; passed: number }
  >();
  const entryFor = (id: string) =>
    byUser.get(id) ?? { completed: 0, durations: [], checks: 0, passed: 0 };

  for (const row of verifications) {
    if (!row.completed_by || row.is_complete !== true) continue;
    if (!withinPeriod(row.completed_at, period)) continue;
    const entry = entryFor(row.completed_by);
    entry.completed += 1;
    if (row.created_at && row.completed_at) {
      const days = daysBetween(row.created_at, row.completed_at);
      if (Number.isFinite(days) && days >= 0) entry.durations.push(days);
    }
    byUser.set(row.completed_by, entry);
  }

  for (const row of checks) {
    if (!row.checked_by) continue;
    if (!withinPeriod(row.checked_at, period)) continue;
    const entry = entryFor(row.checked_by);
    entry.checks += 1;
    if (row.result === "pass") entry.passed += 1;
    byUser.set(row.checked_by, entry);
  }

  return Array.from(byUser.entries())
    .map(([userId, entry]) => ({
      userId,
      name: nameOf(names, userId),
      verificationsCompleted: entry.completed,
      avgDaysToComplete: mean(entry.durations),
      checksRecorded: entry.checks,
      checkPassRatePct: rate(entry.passed, entry.checks),
    }))
    .sort((a, b) => b.verificationsCompleted - a.verificationsCompleted);
}

// --- Loan release ---------------------------------------------------------

export type LraScorecardRow = {
  userId: string;
  name: string;
  filesAssigned: number;
  filesReleased: number;
  avgDaysToRelease: number | null;
};

export type ReleaseFileRow = {
  assigned_to: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const RELEASE_FILE_DONE = new Set(["released", "closed"]);

export function buildLraScorecard(
  files: ReleaseFileRow[],
  names: Map<string, string>,
  period?: Period,
): LraScorecardRow[] {
  const byUser = new Map<string, { assigned: number; released: number; durations: number[] }>();

  for (const file of files) {
    if (!file.assigned_to) continue;
    const done = RELEASE_FILE_DONE.has(file.status ?? "");
    // Assignment is not timestamped, so scope on the completion date and count
    // an open file against the period it is still sitting in.
    const stamp = done ? file.updated_at : file.created_at;
    if (!withinPeriod(stamp, period)) continue;

    const entry = byUser.get(file.assigned_to) ?? {
      assigned: 0,
      released: 0,
      durations: [],
    };
    entry.assigned += 1;
    if (done) {
      entry.released += 1;
      if (file.created_at && file.updated_at) {
        const days = daysBetween(file.created_at, file.updated_at);
        if (Number.isFinite(days) && days >= 0) entry.durations.push(days);
      }
    }
    byUser.set(file.assigned_to, entry);
  }

  return Array.from(byUser.entries())
    .map(([userId, entry]) => ({
      userId,
      name: nameOf(names, userId),
      filesAssigned: entry.assigned,
      filesReleased: entry.released,
      avgDaysToRelease: mean(entry.durations),
    }))
    .sort((a, b) => b.filesReleased - a.filesReleased);
}

// --- Remedial -------------------------------------------------------------

export type RemedialScorecardRow = {
  userId: string;
  name: string;
  accountsHeld: number;
  turnoversReceived: number;
  amountRecovered: number;
};

export type TurnoverRow = {
  masterlist_id: string;
  to_remedial_user_id: string | null;
  confirmed_at: string | null;
};

export type RemedialAssignmentRow = {
  masterlist_id: string;
  remedial_user_id: string | null;
};

export type RecoveryPostingRow = {
  masterlist_id: string | null;
  amount: number | null;
  posted_at: string | null;
};

/**
 * Recovery only counts cash posted *after* the account was turned over — money
 * the previous collector already brought in is not the remedial officer's win.
 */
export function buildRemedialScorecard(
  assignments: RemedialAssignmentRow[],
  turnovers: TurnoverRow[],
  postings: RecoveryPostingRow[],
  names: Map<string, string>,
  period?: Period,
): RemedialScorecardRow[] {
  const byUser = new Map<string, { held: number; turnovers: number; recovered: number }>();
  const entryFor = (id: string) => byUser.get(id) ?? { held: 0, turnovers: 0, recovered: 0 };

  for (const row of assignments) {
    if (!row.remedial_user_id) continue;
    const entry = entryFor(row.remedial_user_id);
    entry.held += 1;
    byUser.set(row.remedial_user_id, entry);
  }

  const turnedOverAt = new Map<string, { userId: string; at: string }>();
  for (const row of turnovers) {
    if (!row.to_remedial_user_id || !row.confirmed_at) continue;
    const entry = entryFor(row.to_remedial_user_id);
    entry.turnovers += 1;
    byUser.set(row.to_remedial_user_id, entry);
    turnedOverAt.set(row.masterlist_id, {
      userId: row.to_remedial_user_id,
      at: row.confirmed_at,
    });
  }

  for (const posting of postings) {
    if (!posting.masterlist_id || !posting.posted_at) continue;
    const turnover = turnedOverAt.get(posting.masterlist_id);
    if (!turnover || posting.posted_at < turnover.at) continue;
    if (!withinPeriod(posting.posted_at, period)) continue;
    const entry = entryFor(turnover.userId);
    entry.recovered += Number(posting.amount ?? 0);
    byUser.set(turnover.userId, entry);
  }

  return Array.from(byUser.entries())
    .map(([userId, entry]) => ({
      userId,
      name: nameOf(names, userId),
      accountsHeld: entry.held,
      turnoversReceived: entry.turnovers,
      amountRecovered: Math.round(entry.recovered * 100) / 100,
    }))
    .sort((a, b) => b.amountRecovered - a.amountRecovered);
}
