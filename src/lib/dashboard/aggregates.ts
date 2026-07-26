import type { SupabaseClient } from "@supabase/supabase-js";

import { buildExecutiveSummary } from "@/lib/reports/aggregates";

import { averageDays, bucketByDay, bucketByMonth, bucketByWeek, daysAgoIso } from "./buckets";
import type {
  ArWidgetData,
  AuditWidgetData,
  AuthAdminWidgetData,
  CollectionWidgetData,
  CommitteeWidgetData,
  ComputationWidgetData,
  IntakeWidgetData,
  LeadsWidgetData,
  NegotiationWidgetData,
  ReleaseWidgetData,
  RemedialWidgetData,
  VerificationWidgetData,
  WidgetDataMap,
  WidgetSlug,
} from "./types";

const WEEKS = 8;
const MONTHS = 6;
/** Covers WEEKS Monday-based weeks plus the current partial week. */
const WEEK_CUTOFF_DAYS = WEEKS * 7 + 7;
const MONTH_CUTOFF_DAYS = MONTHS * 31 + 7;

function fail(message: string): never {
  throw new Error(message);
}

export async function buildIntakeWidget(
  supabase: SupabaseClient,
): Promise<IntakeWidgetData> {
  // Exclude 'draft' — pre-submission applications the borrower hasn't
  // submitted yet are not part of CSA's workload and shouldn't inflate
  // their own pipeline widget.
  const { data, error } = await supabase
    .from("loan_applications")
    .select("status, created_at")
    .neq("status", "draft");
  if (error) fail(error.message);

  const rows = data ?? [];
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.status as string] = (counts[row.status as string] ?? 0) + 1;
  }

  const weekly = bucketByWeek(
    rows.map((r) => ({ at: r.created_at as string })),
    WEEKS,
  );

  return {
    statusCounts: Object.entries(counts).map(([status, count]) => ({ status, count })),
    weekly,
    newThisWeek: weekly[weekly.length - 1]?.count ?? 0,
  };
}

export async function buildComputationWidget(
  supabase: SupabaseClient,
): Promise<ComputationWidgetData> {
  const { data, error } = await supabase
    .from("computations")
    .select("input_amount, net_released, loan_type_name, created_at")
    .gte("created_at", daysAgoIso(90));
  if (error) fail(error.message);

  const rows = data ?? [];
  const byType = new Map<string, { requested: number; computed: number; count: number }>();
  let computedSum = 0;

  for (const row of rows) {
    const key = (row.loan_type_name as string | null) ?? "Unspecified";
    const entry = byType.get(key) ?? { requested: 0, computed: 0, count: 0 };
    entry.requested += Number(row.input_amount);
    entry.computed += Number(row.net_released);
    entry.count += 1;
    byType.set(key, entry);
    computedSum += Number(row.net_released);
  }

  return {
    byLoanType: [...byType.entries()].map(([loanType, v]) => ({
      loanType,
      requested: Math.round(v.requested),
      computed: Math.round(v.computed),
      count: v.count,
    })),
    avgComputed: rows.length > 0 ? Math.round(computedSum / rows.length) : null,
    totalComputations: rows.length,
  };
}

export async function buildVerificationWidget(
  supabase: SupabaseClient,
): Promise<VerificationWidgetData> {
  const [checksRes, verificationsRes, pendingRes] = await Promise.all([
    supabase
      .from("checks_recorded")
      .select("result, check_types(name)")
      .eq("stage", "cig"),
    supabase
      .from("verifications")
      .select("created_at, completed_at")
      .eq("is_complete", true)
      .gte("created_at", daysAgoIso(90)),
    supabase
      .from("loan_applications")
      .select("id", { count: "exact", head: true })
      .eq("status", "for_verification"),
  ]);
  if (checksRes.error) fail(checksRes.error.message);
  if (verificationsRes.error) fail(verificationsRes.error.message);

  const byCheck = new Map<string, { pending: number; pass: number; fail: number }>();
  for (const row of checksRes.data ?? []) {
    const name =
      (row.check_types as unknown as { name: string } | null)?.name ?? "Unknown";
    const entry = byCheck.get(name) ?? { pending: 0, pass: 0, fail: 0 };
    const result = row.result as "pending" | "pass" | "fail";
    entry[result] += 1;
    byCheck.set(name, entry);
  }

  const tat = averageDays(
    (verificationsRes.data ?? []).map((v) => ({
      from: v.created_at as string,
      to: v.completed_at as string | null,
    })),
  );

  return {
    checks: [...byCheck.entries()].map(([checkType, v]) => ({ checkType, ...v })),
    avgTatDays: tat.averageDays,
    pendingVerifications: pendingRes.count ?? 0,
  };
}

export async function buildCommitteeWidget(
  supabase: SupabaseClient,
): Promise<CommitteeWidgetData> {
  const [actionsRes, pendingRes] = await Promise.all([
    supabase
      .from("committee_actions")
      .select("action, acted_at")
      .gte("acted_at", daysAgoIso(MONTH_CUTOFF_DAYS)),
    supabase
      .from("loan_applications")
      .select("id", { count: "exact", head: true })
      .eq("status", "for_approval"),
  ]);
  if (actionsRes.error) fail(actionsRes.error.message);

  const rows = actionsRes.data ?? [];
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const thisMonth: Record<string, number> = { approve: 0, deny: 0, revisit: 0, hold: 0 };
  for (const row of rows) {
    if (new Date(row.acted_at as string) >= monthStart) {
      thisMonth[row.action as string] = (thisMonth[row.action as string] ?? 0) + 1;
    }
  }

  const approvals = bucketByMonth(
    rows
      .filter((r) => r.action === "approve")
      .map((r) => ({ at: r.acted_at as string })),
    MONTHS,
  );
  const denials = bucketByMonth(
    rows
      .filter((r) => r.action === "deny")
      .map((r) => ({ at: r.acted_at as string })),
    MONTHS,
  );

  const approvalTrend = approvals.map((point, i) => {
    const decided = point.count + (denials[i]?.count ?? 0);
    return {
      label: point.label,
      approvalRate:
        decided > 0 ? Math.round((point.count / decided) * 1000) / 10 : null,
      decisions: decided,
    };
  });

  return {
    decisionsThisMonth: (["approve", "deny", "revisit", "hold"] as const).map(
      (action) => ({ action, count: thisMonth[action] ?? 0 }),
    ),
    approvalTrend,
    pendingApplications: pendingRes.count ?? 0,
  };
}

export async function buildNegotiationWidget(
  supabase: SupabaseClient,
): Promise<NegotiationWidgetData> {
  const { data, error } = await supabase.from("negotiations").select("status");
  if (error) fail(error.message);

  const rows = data ?? [];
  const count = (status: string) => rows.filter((r) => r.status === status).length;
  const signed = count("signed");

  return {
    active: count("pending_disclosure") + count("negotiating"),
    awaitingSignature: count("awaiting_signature"),
    signed,
    acceptanceRate:
      rows.length > 0 ? Math.round((signed / rows.length) * 1000) / 10 : null,
  };
}

export async function buildLeadsWidget(
  supabase: SupabaseClient,
): Promise<LeadsWidgetData> {
  const [leadsRes, applicationsRes] = await Promise.all([
    supabase
      .from("leads")
      .select("id, borrower_name, status, created_at, application_id")
      .order("created_at", { ascending: false }),
    // Exclude 'draft' — a borrower's own pre-submission application isn't
    // part of the lead-conversion funnel (drafts aren't linked to leads).
    supabase.from("loan_applications").select("status").neq("status", "draft"),
  ]);
  if (leadsRes.error) fail(leadsRes.error.message);
  if (applicationsRes.error) fail(applicationsRes.error.message);

  const rows = leadsRes.data ?? [];
  const converted = rows.filter((r) => r.application_id != null).length;

  const funnelCounts: Record<string, number> = {};
  for (const app of applicationsRes.data ?? []) {
    funnelCounts[app.status as string] = (funnelCounts[app.status as string] ?? 0) + 1;
  }

  return {
    weekly: bucketByWeek(
      rows.map((r) => ({ at: r.created_at as string })),
      WEEKS,
    ),
    totalLeads: rows.length,
    converted,
    conversionRate:
      rows.length > 0 ? Math.round((converted / rows.length) * 1000) / 10 : null,
    funnel: Object.entries(funnelCounts).map(([status, count]) => ({ status, count })),
    recentLeads: rows.slice(0, 5).map((r) => ({
      id: r.id as string,
      borrowerName: r.borrower_name as string,
      converted: r.application_id != null,
      createdAt: r.created_at as string,
    })),
  };
}

export async function buildReleaseWidget(
  supabase: SupabaseClient,
): Promise<ReleaseWidgetData> {
  const [releasesRes, queueRes, historiesRes] = await Promise.all([
    supabase
      .from("masterlist")
      .select("release_date")
      .gte("release_date", daysAgoIso(WEEK_CUTOFF_DAYS).slice(0, 10)),
    supabase
      .from("release_files")
      .select("id", { count: "exact", head: true })
      .not("status", "in", "(released,closed)"),
    supabase
      .from("loan_applications")
      .select("status_history")
      .in("status", ["released", "loan_active", "closed", "paid_off"]),
  ]);
  if (releasesRes.error) fail(releasesRes.error.message);
  if (historiesRes.error) fail(historiesRes.error.message);

  const pairs = (historiesRes.data ?? []).map((row) => {
    const history = (row.status_history ?? []) as Array<{ status: string; at: string }>;
    const approved = history.find((e) => e.status === "approved");
    const released = history.find(
      (e) => e.status === "released" && (!approved || e.at >= approved.at),
    );
    return { from: approved?.at ?? null, to: released?.at ?? null };
  });

  return {
    weeklyReleases: bucketByWeek(
      (releasesRes.data ?? []).map((r) => ({ at: r.release_date as string })),
      WEEKS,
    ),
    pendingQueue: queueRes.count ?? 0,
    avgApprovalToReleaseDays: averageDays(pairs).averageDays,
  };
}

export async function buildArWidget(supabase: SupabaseClient): Promise<ArWidgetData> {
  const [masterlistRes, postingsRes] = await Promise.all([
    supabase
      .from("masterlist")
      .select("aging_bucket, outstanding_balance, account_status, total_loan, release_date"),
    supabase.from("postings").select("amount, posted_at"),
  ]);
  if (masterlistRes.error) fail(masterlistRes.error.message);
  if (postingsRes.error) fail(postingsRes.error.message);

  const accounts = (masterlistRes.data ?? []).filter(
    (r) => r.account_status !== "paid",
  );
  const buckets = ["current", "1-30", "31-60", "61-90", "91+"];
  const aging = buckets.map((bucket) => {
    const rows = accounts.filter((r) => r.aging_bucket === bucket);
    return {
      bucket,
      count: rows.length,
      outstanding: Math.round(
        rows.reduce((s, r) => s + Number(r.outstanding_balance), 0),
      ),
    };
  });

  // Approximate outstanding history: cumulative released total_loan minus
  // cumulative postings at each month end. True history needs a snapshot table.
  const monthEnds: Date[] = [];
  const now = new Date();
  for (let i = MONTHS - 1; i >= 0; i--) {
    monthEnds.push(new Date(now.getFullYear(), now.getMonth() - i + 1, 1));
  }
  const releases = (masterlistRes.data ?? [])
    .filter((r) => r.release_date != null)
    .map((r) => ({ at: new Date(r.release_date as string), amount: Number(r.total_loan) }));
  const postings = (postingsRes.data ?? []).map((r) => ({
    at: new Date(r.posted_at as string),
    amount: Number(r.amount),
  }));
  const MONTH_LABEL = new Intl.DateTimeFormat("en-PH", { month: "short" });
  const outstandingTrend = monthEnds.map((end) => {
    const released = releases
      .filter((r) => r.at < end)
      .reduce((s, r) => s + r.amount, 0);
    const posted = postings
      .filter((p) => p.at < end)
      .reduce((s, p) => s + p.amount, 0);
    const label = MONTH_LABEL.format(
      new Date(end.getFullYear(), end.getMonth() - 1, 1),
    );
    return { label, outstanding: Math.max(0, Math.round(released - posted)) };
  });

  return {
    aging,
    outstandingTrend,
    totalOutstanding: Math.round(
      accounts.reduce((s, r) => s + Number(r.outstanding_balance), 0),
    ),
    activeAccounts: accounts.length,
  };
}

export async function buildCollectionWidget(
  supabase: SupabaseClient,
): Promise<CollectionWidgetData> {
  const cutoffDate = daysAgoIso(WEEK_CUTOFF_DAYS).slice(0, 10);
  const [paymentsRes, dueRes, draftRes, submittedRes, reconciledRes] =
    await Promise.all([
      supabase
        .from("payments")
        .select("payment_date, amount, status")
        .in("status", ["confirmed", "posted"])
        .gte("payment_date", cutoffDate),
      supabase
        .from("amortization_schedules")
        .select("due_date, amount_due")
        .gte("due_date", cutoffDate),
      supabase.from("dcr").select("id", { count: "exact", head: true }).eq("status", "draft"),
      supabase.from("dcr").select("id", { count: "exact", head: true }).eq("status", "submitted"),
      supabase.from("dcr").select("id", { count: "exact", head: true }).eq("status", "reconciled"),
    ]);
  if (paymentsRes.error) fail(paymentsRes.error.message);
  if (dueRes.error) fail(dueRes.error.message);

  const collected = bucketByWeek(
    (paymentsRes.data ?? []).map((r) => ({
      at: r.payment_date as string,
      value: Number(r.amount),
    })),
    WEEKS,
  );
  const due = bucketByWeek(
    (dueRes.data ?? []).map((r) => ({
      at: r.due_date as string,
      value: Number(r.amount_due),
    })),
    WEEKS,
  );

  const weekly = collected.map((point, i) => ({
    label: point.label,
    collected: point.total,
    due: due[i]?.total ?? 0,
  }));

  return {
    weekly,
    dcr: {
      draft: draftRes.count ?? 0,
      submitted: submittedRes.count ?? 0,
      reconciled: reconciledRes.count ?? 0,
    },
    collectedThisWeek: weekly[weekly.length - 1]?.collected ?? 0,
  };
}

export async function buildRemedialWidget(
  supabase: SupabaseClient,
): Promise<RemedialWidgetData> {
  const [masterlistRes, turnoversRes] = await Promise.all([
    supabase
      .from("masterlist")
      .select("account_status, outstanding_balance")
      .in("account_status", ["default", "remedial"]),
    supabase
      .from("remedial_turnovers")
      .select("created_at")
      .gte("created_at", daysAgoIso(MONTH_CUTOFF_DAYS)),
  ]);
  if (masterlistRes.error) fail(masterlistRes.error.message);
  if (turnoversRes.error) fail(turnoversRes.error.message);

  const rows = masterlistRes.data ?? [];

  return {
    byStatus: ["default", "remedial"].map((status) => ({
      status,
      count: rows.filter((r) => r.account_status === status).length,
    })),
    monthlyTurnovers: bucketByMonth(
      (turnoversRes.data ?? []).map((r) => ({ at: r.created_at as string })),
      MONTHS,
    ),
    totalUnderRemedial: Math.round(
      rows
        .filter((r) => r.account_status === "remedial")
        .reduce((s, r) => s + Number(r.outstanding_balance), 0),
    ),
  };
}

export async function buildAuthAdminWidget(
  supabase: SupabaseClient,
): Promise<AuthAdminWidgetData> {
  const [profilesRes, rolesRes] = await Promise.all([
    supabase.from("profiles").select("is_active"),
    supabase.from("user_roles").select("roles(name)"),
  ]);
  if (profilesRes.error) fail(profilesRes.error.message);
  if (rolesRes.error) fail(rolesRes.error.message);

  const profiles = profilesRes.data ?? [];
  const active = profiles.filter((p) => p.is_active).length;

  const byRole = new Map<string, number>();
  for (const row of rolesRes.data ?? []) {
    const name = (row.roles as unknown as { name: string } | null)?.name ?? "Unknown";
    byRole.set(name, (byRole.get(name) ?? 0) + 1);
  }

  return {
    totalUsers: profiles.length,
    activeUsers: active,
    inactiveUsers: profiles.length - active,
    byRole: [...byRole.entries()].map(([role, count]) => ({ role, count })),
  };
}

export async function buildAuditWidget(
  supabase: SupabaseClient,
): Promise<AuditWidgetData> {
  const { data, error } = await supabase
    .from("audit_events")
    .select("action, module_slug, entity_type, created_at")
    .gte("created_at", daysAgoIso(14))
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) fail(error.message);

  const rows = data ?? [];

  return {
    daily: bucketByDay(
      rows.map((r) => ({ at: r.created_at as string })),
      14,
    ),
    recent: rows.slice(0, 8).map((r) => ({
      action: r.action as string,
      moduleSlug: r.module_slug as string,
      entityType: (r.entity_type as string | null) ?? null,
      createdAt: r.created_at as string,
    })),
  };
}

type WidgetBuilder = (supabase: SupabaseClient) => Promise<WidgetDataMap[WidgetSlug]>;

export const WIDGET_BUILDERS: Record<WidgetSlug, WidgetBuilder> = {
  intake: buildIntakeWidget,
  computation: buildComputationWidget,
  verification: buildVerificationWidget,
  committee: buildCommitteeWidget,
  negotiation: buildNegotiationWidget,
  leads: buildLeadsWidget,
  release_lra: buildReleaseWidget,
  accounting_ar: buildArWidget,
  collection: buildCollectionWidget,
  remedial: buildRemedialWidget,
  reports: buildExecutiveSummary,
  auth_admin: buildAuthAdminWidget,
  audit_log: buildAuditWidget,
};
