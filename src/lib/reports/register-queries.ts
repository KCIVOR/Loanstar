import type { SupabaseClient } from "@supabase/supabase-js";

import { daysPastDue } from "@/lib/ar/schedule";
import type { Period } from "@/lib/reports/metrics/types";

import {
  buildCollectorCollections,
  type CollectionSegment,
  type CollectorCollectionRow,
} from "./collections-register";
import {
  filterPastDue,
  type LoanRegisterRow,
  type PastDueAging,
  type PastDueRow,
} from "./registers";
import { asCollateralType, asLoanSegment } from "./segments";

async function resolveNames(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Map<string, string>> {
  const nameById = new Map<string, string>();
  if (!userIds.length) return nameById;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds);
  if (error) throw new Error(error.message);
  for (const profile of data ?? []) {
    nameById.set(
      profile.id as string,
      (profile.full_name as string) || (profile.email as string) || "Unknown",
    );
  }
  return nameById;
}

export async function fetchLoanRegister(
  supabase: SupabaseClient,
): Promise<LoanRegisterRow[]> {
  const [{ data: masterlist, error: mlError }, { data: assignments, error: asError }] =
    await Promise.all([
      supabase
        .from("masterlist")
        .select(
          "id, loan_application_id, borrower_id, loan_account_no, borrower_name, segment, account_status, aging_bucket, outstanding_balance, total_loan, release_date",
        ),
      supabase.from("assignments").select("masterlist_id, collector_user_id, remedial_user_id"),
    ]);
  if (mlError) throw new Error(mlError.message);
  if (asError) throw new Error(asError.message);

  const assignmentByMasterlist = new Map<
    string,
    { collectorUserId: string | null; remedialUserId: string | null }
  >();
  const userIds = new Set<string>();
  for (const row of assignments ?? []) {
    const collectorUserId = (row.collector_user_id as string | null) ?? null;
    const remedialUserId = (row.remedial_user_id as string | null) ?? null;
    assignmentByMasterlist.set(row.masterlist_id as string, {
      collectorUserId,
      remedialUserId,
    });
    if (collectorUserId) userIds.add(collectorUserId);
    if (remedialUserId) userIds.add(remedialUserId);
  }

  const names = await resolveNames(supabase, [...userIds]);

  const applicationIds = [
    ...new Set(
      (masterlist ?? [])
        .map((row) => row.loan_application_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const collateralByApplication = new Map<string, ReturnType<typeof asCollateralType>>();
  if (applicationIds.length > 0) {
    const { data: applications, error: appError } = await supabase
      .from("loan_applications")
      .select("id, collateral_type")
      .in("id", applicationIds);
    if (appError) throw new Error(appError.message);
    for (const row of applications ?? []) {
      collateralByApplication.set(row.id as string, asCollateralType(row.collateral_type));
    }
  }

  return (masterlist ?? []).map((row) => {
    const assignment = assignmentByMasterlist.get(row.id as string);
    const applicationId = (row.loan_application_id as string | null) ?? null;
    return {
      masterlistId: row.id as string,
      loanAccountNo: (row.loan_account_no as string | null) ?? null,
      borrowerId: row.borrower_id as string,
      borrowerName: (row.borrower_name as string) || "",
      segment: asLoanSegment(row.segment),
      collateralType: applicationId
        ? (collateralByApplication.get(applicationId) ?? "none")
        : "none",
      accountStatus: (row.account_status as string) ?? "",
      agingBucket: (row.aging_bucket as string) ?? "current",
      outstanding: Number(row.outstanding_balance ?? 0),
      totalLoan: Number(row.total_loan ?? 0),
      releaseDate: (row.release_date as string | null) ?? null,
      collectorName: assignment?.collectorUserId
        ? names.get(assignment.collectorUserId) ?? null
        : null,
      remedialName: assignment?.remedialUserId
        ? names.get(assignment.remedialUserId) ?? null
        : null,
    };
  });
}

function daysLateForAccount(
  schedules: Array<{ due_date: string; status: string }>,
): number {
  const overdue = schedules
    .filter((row) => row.status !== "rolled" && row.status !== "paid")
    .filter((row) => daysPastDue(row.due_date) > 0)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  return overdue ? daysPastDue(overdue.due_date) : 0;
}

export async function fetchPastDueRegister(
  supabase: SupabaseClient,
  aging: PastDueAging = "all",
): Promise<PastDueRow[]> {
  const pastDue = filterPastDue(await fetchLoanRegister(supabase), aging);
  if (!pastDue.length) return [];

  const ids = pastDue.map((row) => row.masterlistId);
  const { data: schedules, error } = await supabase
    .from("amortization_schedules")
    .select("masterlist_id, due_date, status")
    .in("masterlist_id", ids)
    .neq("status", "paid");
  if (error) throw new Error(error.message);

  const byAccount = new Map<string, Array<{ due_date: string; status: string }>>();
  for (const row of schedules ?? []) {
    const masterlistId = row.masterlist_id as string;
    const list = byAccount.get(masterlistId) ?? [];
    list.push({ due_date: row.due_date as string, status: row.status as string });
    byAccount.set(masterlistId, list);
  }

  return pastDue.map((row) => ({
    ...row,
    daysLate: daysLateForAccount(byAccount.get(row.masterlistId) ?? []),
  }));
}

export async function fetchCollectorCollections(
  supabase: SupabaseClient,
  period: Period,
  segment: CollectionSegment,
): Promise<CollectorCollectionRow[]> {
  const fromTs = `${period.from}T00:00:00.000Z`;
  const toTs = `${period.to}T23:59:59.999Z`;
  const [
    { data: assignments, error: assignError },
    { data: postings, error: postingsError },
    { data: dcrs, error: dcrError },
    { data: masterlist, error: mlError },
  ] = await Promise.all([
    supabase.from("assignments").select("masterlist_id, collector_user_id"),
    supabase
      .from("postings")
      .select("masterlist_id, amount")
      .gte("posted_at", fromTs)
      .lte("posted_at", toTs),
    supabase
      .from("dcr")
      .select("collector_user_id, status, submitted_at")
      .gte("submitted_at", fromTs)
      .lte("submitted_at", toTs),
    supabase.from("masterlist").select("id, segment"),
  ]);
  if (assignError) throw new Error(assignError.message);
  if (postingsError) throw new Error(postingsError.message);
  if (dcrError) throw new Error(dcrError.message);
  if (mlError) throw new Error(mlError.message);

  const collectorIds = new Set<string>();
  for (const row of assignments ?? []) {
    if (row.collector_user_id) collectorIds.add(row.collector_user_id as string);
  }
  for (const row of dcrs ?? []) {
    if (row.collector_user_id) collectorIds.add(row.collector_user_id as string);
  }
  const names = await resolveNames(supabase, [...collectorIds]);

  return buildCollectorCollections({
    assignments: (assignments ?? []).map((row) => ({
      masterlistId: row.masterlist_id as string,
      collectorUserId: (row.collector_user_id as string | null) ?? null,
    })),
    postings: (postings ?? []).map((row) => ({
      masterlistId: row.masterlist_id as string,
      amount: Number(row.amount ?? 0),
    })),
    dcrs: (dcrs ?? []).map((row) => ({
      collectorUserId: (row.collector_user_id as string | null) ?? null,
      status: row.status as string,
    })),
    masterlistSegments: (masterlist ?? []).map((row) => ({
      id: row.id as string,
      segment: (row.segment as string | null) ?? null,
    })),
    names,
    segment,
  });
}
