import type { SupabaseClient } from "@supabase/supabase-js";

import { appendStatusHistory } from "@/lib/applications/status";

import {
  BLOCKER_BY_STATUS,
  type ReleaseFileStatus,
} from "./constants";

export async function syncApplicationBlocker(
  supabase: SupabaseClient,
  applicationId: string,
  releaseStatus: ReleaseFileStatus,
  options?: { actorId?: string; applicationStatus?: string },
) {
  const blocker = BLOCKER_BY_STATUS[releaseStatus];

  const updates: Record<string, unknown> = { blocker };

  if (options?.applicationStatus) {
    await appendStatusHistory(
      supabase,
      applicationId,
      options.applicationStatus,
      { actorId: options.actorId, note: blocker },
    );
    return blocker;
  }

  await supabase
    .from("loan_applications")
    .update({ blocker })
    .eq("id", applicationId);

  return blocker;
}

export function mapReleaseFileRow(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    loanApplicationId: row.loan_application_id as string,
    computationId: row.computation_id as string,
    releasePath: (row.release_path as string) ?? null,
    status: row.status as ReleaseFileStatus,
    blankCheckFrom: (row.blank_check_from as string) ?? null,
    blankCheckTo: (row.blank_check_to as string) ?? null,
    atmBankName: (row.atm_bank_name as string) ?? null,
    atmCardLast4: (row.atm_card_last4 as string) ?? null,
    assignedTo: (row.assigned_to as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
