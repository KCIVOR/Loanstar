import type { ModuleSlug } from "@/lib/constants";
import type { buildExecutiveSummary } from "@/lib/reports/aggregates";

import type { SeriesPoint } from "./buckets";

export type IntakeWidgetData = {
  statusCounts: Array<{ status: string; count: number }>;
  weekly: SeriesPoint[];
  newThisWeek: number;
};

export type ComputationWidgetData = {
  byLoanType: Array<{
    loanType: string;
    requested: number;
    computed: number;
    count: number;
  }>;
  avgComputed: number | null;
  totalComputations: number;
};

export type VerificationWidgetData = {
  checks: Array<{ checkType: string; pending: number; pass: number; fail: number }>;
  avgTatDays: number | null;
  pendingVerifications: number;
};

export type CommitteeWidgetData = {
  decisionsThisMonth: Array<{ action: "approve" | "deny" | "revisit" | "hold"; count: number }>;
  approvalTrend: Array<{ label: string; approvalRate: number | null; decisions: number }>;
  pendingApplications: number;
};

export type NegotiationWidgetData = {
  active: number;
  awaitingSignature: number;
  signed: number;
  acceptanceRate: number | null;
};

export type LeadsWidgetData = {
  weekly: SeriesPoint[];
  totalLeads: number;
  converted: number;
  conversionRate: number | null;
  funnel: Array<{ status: string; count: number }>;
  recentLeads: Array<{
    id: string;
    borrowerName: string;
    converted: boolean;
    createdAt: string;
  }>;
};

export type ReleaseWidgetData = {
  weeklyReleases: SeriesPoint[];
  pendingQueue: number;
  avgApprovalToReleaseDays: number | null;
};

export type ArWidgetData = {
  aging: Array<{ bucket: string; count: number; outstanding: number }>;
  /** Approximate trend: cumulative released minus cumulative postings per month.
   * True history requires an aging snapshot table (future migration). */
  outstandingTrend: Array<{ label: string; outstanding: number }>;
  totalOutstanding: number;
  activeAccounts: number;
};

export type CollectionWidgetData = {
  weekly: Array<{ label: string; collected: number; due: number }>;
  dcr: { draft: number; submitted: number; reconciled: number };
  collectedThisWeek: number;
};

export type RemedialWidgetData = {
  byStatus: Array<{ status: string; count: number }>;
  monthlyTurnovers: SeriesPoint[];
  totalUnderRemedial: number;
};

export type ReportsWidgetData = Awaited<ReturnType<typeof buildExecutiveSummary>>;

export type AuthAdminWidgetData = {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  byRole: Array<{ role: string; count: number }>;
};

export type AuditWidgetData = {
  daily: SeriesPoint[];
  recent: Array<{
    action: string;
    moduleSlug: string;
    entityType: string | null;
    createdAt: string;
  }>;
};

export type WidgetDataMap = {
  intake: IntakeWidgetData;
  computation: ComputationWidgetData;
  verification: VerificationWidgetData;
  committee: CommitteeWidgetData;
  negotiation: NegotiationWidgetData;
  leads: LeadsWidgetData;
  release_lra: ReleaseWidgetData;
  accounting_ar: ArWidgetData;
  collection: CollectionWidgetData;
  remedial: RemedialWidgetData;
  reports: ReportsWidgetData;
  auth_admin: AuthAdminWidgetData;
  audit_log: AuditWidgetData;
};

export type WidgetSlug = keyof WidgetDataMap;

export type WidgetError = { error: true };

export type WidgetsResponse = {
  widgets: Partial<Record<ModuleSlug, WidgetDataMap[WidgetSlug] | WidgetError>>;
  generatedAt: string;
};

export function isWidgetError(value: unknown): value is WidgetError {
  return typeof value === "object" && value !== null && "error" in value;
}
