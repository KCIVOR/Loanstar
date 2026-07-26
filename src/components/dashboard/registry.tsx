"use client";

import type { ComponentType } from "react";

import type { ModuleSlug } from "@/lib/constants";
import type { WidgetDataMap, WidgetSlug } from "@/lib/dashboard/types";

import { ArWidget, CollectionWidget, ReleaseWidget, RemedialWidget } from "./widgets/money";
import {
  CommitteeWidget,
  ComputationWidget,
  IntakeWidget,
  LeadsWidget,
  NegotiationWidget,
  VerificationWidget,
} from "./widgets/pipeline";
import { AuditWidget, AuthAdminWidget, ReportsWidget } from "./widgets/system";

type WidgetComponent<S extends WidgetSlug> = ComponentType<{ data: WidgetDataMap[S] }>;

type Registry = { [S in WidgetSlug]: WidgetComponent<S> };

/** Module slug → widget component. Modules without an entry (borrower_portal,
 * system_config) render as plain linked permission cards on the dashboard. */
export const DASHBOARD_WIDGETS: Registry = {
  intake: IntakeWidget,
  computation: ComputationWidget,
  verification: VerificationWidget,
  committee: CommitteeWidget,
  negotiation: NegotiationWidget,
  leads: LeadsWidget,
  release_lra: ReleaseWidget,
  accounting_ar: ArWidget,
  collection: CollectionWidget,
  remedial: RemedialWidget,
  reports: ReportsWidget,
  auth_admin: AuthAdminWidget,
  audit_log: AuditWidget,
};

export function isWidgetSlug(slug: ModuleSlug): slug is WidgetSlug {
  return slug in DASHBOARD_WIDGETS;
}

type SkeletonShape = { kpis: number; charts: Array<"half" | "full">; table?: boolean };

/** Card layout per module, so the loading skeleton matches the real content
 * shape instead of a generic spinner. */
export const WIDGET_SKELETON: Record<WidgetSlug, SkeletonShape> = {
  intake: { kpis: 1, charts: ["half", "half"] },
  computation: { kpis: 2, charts: ["full"] },
  verification: { kpis: 2, charts: ["full"] },
  committee: { kpis: 1, charts: ["half", "half"] },
  negotiation: { kpis: 4, charts: [] },
  leads: { kpis: 3, charts: ["half", "half"], table: true },
  release_lra: { kpis: 2, charts: ["full"] },
  accounting_ar: { kpis: 2, charts: ["half", "half"] },
  collection: { kpis: 4, charts: ["full"] },
  remedial: { kpis: 2, charts: ["full"] },
  reports: { kpis: 4, charts: ["full"] },
  auth_admin: { kpis: 3, charts: [], table: true },
  audit_log: { kpis: 0, charts: ["full"], table: true },
};
