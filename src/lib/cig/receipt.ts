import type { SupabaseClient } from "@supabase/supabase-js";

import { appendStatusHistory } from "@/lib/applications/status";
import {
  getCompletionSummary,
  getStageChecklist,
} from "@/lib/documents/checklist";

export type ReceiptCheckItem = {
  label: string;
  ok: boolean;
  detail?: string;
};

export type ReceiptReadiness = {
  ready: boolean;
  items: ReceiptCheckItem[];
};

/**
 * CIG receipt check — mirrors the manual "is the transmitted file complete?"
 * review done before starting verification. If anything fails, CIG returns
 * the file to CSA instead of working it.
 */
export async function getReceiptReadiness(
  supabase: SupabaseClient,
  applicationId: string,
  borrower: {
    firstName?: string | null;
    lastName?: string | null;
    mobilePhone?: string | null;
    presentAddress?: unknown;
  } | null,
): Promise<ReceiptReadiness> {
  const checklist = await getStageChecklist(supabase, "intake", applicationId);
  const summary = getCompletionSummary(checklist);
  const checklistComplete =
    summary.required > 0 && summary.complete === summary.required;

  const { data: signedComputation } = await supabase
    .from("computations")
    .select("id")
    .eq("loan_application_id", applicationId)
    .eq("is_active", true)
    .not("signed_at", "is", null)
    .maybeSingle();

  const profileComplete = Boolean(
    borrower?.firstName?.trim() &&
      borrower?.lastName?.trim() &&
      borrower?.mobilePhone?.toString().trim(),
  );

  const items: ReceiptCheckItem[] = [
    {
      label: "Required attachments confirmed",
      ok: checklistComplete,
      detail: `${summary.complete}/${summary.required} required documents`,
    },
    {
      label: "Borrower profile core fields present",
      ok: profileComplete,
      detail: profileComplete ? undefined : "Name or mobile number missing",
    },
    {
      label: "Signed computation on file",
      ok: Boolean(signedComputation),
    },
  ];

  return { ready: items.every((item) => item.ok), items };
}

/**
 * Send an incomplete file back to CSA with a note. Blocker is written first,
 * while the application is still for_verification (the CIG update policies
 * require that status); the transition to `submitted` happens last.
 */
export async function returnToCsa(
  supabase: SupabaseClient,
  applicationId: string,
  actorId: string,
  note: string,
): Promise<void> {
  const { data: blockerRows, error: blockerError } = await supabase
    .from("loan_applications")
    .update({ blocker: `Returned by CIG: ${note}` })
    .eq("id", applicationId)
    .select("id");

  if (blockerError) {
    throw new Error(blockerError.message);
  }
  if (!blockerRows?.length) {
    throw new Error("Failed to set return note (no row updated)");
  }

  await appendStatusHistory(supabase, applicationId, "submitted", {
    actorId,
    note: `Returned to CSA by CIG — ${note}`,
  });
}
