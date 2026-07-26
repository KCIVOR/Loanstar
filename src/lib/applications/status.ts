import type { SupabaseClient } from "@supabase/supabase-js";

import type { ApplicationStatus } from "@/lib/constants";

export type StatusHistoryEntry = {
  status: ApplicationStatus | string;
  at: string;
  actorId?: string | null;
  note?: string | null;
};

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft: "Draft — Not Yet Submitted",
  registered: "Registered",
  documents_pending: "Documents Pending",
  submitted: "Submitted",
  for_verification: "For Verification",
  for_approval: "For Approval",
  approved: "Approved",
  denied: "Denied",
  negotiating_terms: "Negotiating Terms",
  awaiting_confirmation: "Awaiting Confirmation",
  on_hold: "On Hold",
  committee_hold: "On Hold — Committee",
  for_revision: "For Revision",
  lra_pending: "LRA Pending",
  release_signing: "Release — Signing Documents",
  release_briefing: "Release — Awaiting Briefing",
  release_ready: "Release — Ready for Disbursement",
  released: "Released",
  closed: "Closed — Transmitted",
  loan_active: "Loan Active",
  paid_off: "Paid Off",
};

export function formatStatusLabel(status: ApplicationStatus | string): string {
  if (status in STATUS_LABELS) {
    return STATUS_LABELS[status as ApplicationStatus];
  }
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const STATUS_BADGE_VARIANTS: Record<
  ApplicationStatus,
  "success" | "warning" | "danger" | "navy" | "teal" | "neutral"
> = {
  draft: "neutral",
  registered: "neutral",
  documents_pending: "warning",
  submitted: "navy",
  for_verification: "navy",
  for_approval: "navy",
  approved: "success",
  denied: "danger",
  negotiating_terms: "warning",
  awaiting_confirmation: "warning",
  on_hold: "danger",
  committee_hold: "danger",
  for_revision: "danger",
  lra_pending: "navy",
  release_signing: "teal",
  release_briefing: "teal",
  release_ready: "teal",
  released: "success",
  closed: "success",
  loan_active: "success",
  paid_off: "success",
};

export function statusBadgeVariant(
  status: ApplicationStatus | string,
): "success" | "warning" | "danger" | "navy" | "teal" | "neutral" {
  if (status in STATUS_BADGE_VARIANTS) {
    return STATUS_BADGE_VARIANTS[status as ApplicationStatus];
  }
  return "neutral";
}

export async function appendStatusHistory(
  supabase: SupabaseClient,
  applicationId: string,
  newStatus: ApplicationStatus | string,
  options?: { actorId?: string | null; note?: string | null },
): Promise<StatusHistoryEntry[]> {
  const { data: current, error: fetchError } = await supabase
    .from("loan_applications")
    .select("status_history")
    .eq("id", applicationId)
    .single();

  if (fetchError) {
    throw new Error(`Failed to load application status: ${fetchError.message}`);
  }

  const history = (current?.status_history ?? []) as StatusHistoryEntry[];
  const entry: StatusHistoryEntry = {
    status: newStatus,
    at: new Date().toISOString(),
    actorId: options?.actorId ?? null,
    note: options?.note ?? null,
  };
  const updatedHistory = [...history, entry];

  const { data: updated, error: updateError } = await supabase
    .from("loan_applications")
    .update({
      status: newStatus,
      status_history: updatedHistory,
    })
    .eq("id", applicationId)
    .select("id, status")
    .maybeSingle();

  if (updateError) {
    throw new Error(`Failed to update application status: ${updateError.message}`);
  }

  // RLS can silently update 0 rows; treat that as failure so callers don't
  // report success when the application status never changed.
  if (!updated) {
    throw new Error(
      `Failed to update application status to ${newStatus}: no row updated (RLS or missing application)`,
    );
  }

  return updatedHistory;
}
