import type { SupabaseClient } from "@supabase/supabase-js";

import type { ApplicationStatus } from "@/lib/constants";

export type StatusHistoryEntry = {
  status: ApplicationStatus | string;
  at: string;
  actorId?: string | null;
  note?: string | null;
};

const STATUS_LABELS: Record<ApplicationStatus, string> = {
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
  for_revision: "For Revision",
  lra_pending: "LRA Pending",
  release_signing: "Release — Signing Documents",
  release_briefing: "Release — Awaiting Briefing",
  release_ready: "Release — Ready for Disbursement",
  released: "Released",
  closed: "Closed — Transmitted",
  loan_active: "Loan Active",
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

  const { error: updateError } = await supabase
    .from("loan_applications")
    .update({
      status: newStatus,
      status_history: updatedHistory,
    })
    .eq("id", applicationId);

  if (updateError) {
    throw new Error(`Failed to update application status: ${updateError.message}`);
  }

  return updatedHistory;
}
