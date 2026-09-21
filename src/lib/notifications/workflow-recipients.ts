import type { SupabaseClient } from "@supabase/supabase-js";

export type ProofReviewAssignment = {
  collectorUserId: string | null;
  remedialUserId: string | null;
};

/**
 * Current owner of an account's payment proofs: the remedial officer once the
 * account has been handed over, otherwise the collector. Never a role
 * broadcast — `null` means nobody is assigned.
 */
export function chooseProofReviewRecipient(
  assignment: ProofReviewAssignment,
): string | null {
  return assignment.remedialUserId ?? assignment.collectorUserId;
}

export function canReviewAssignedPayment(
  userId: string,
  assignment: ProofReviewAssignment,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || chooseProofReviewRecipient(assignment) === userId;
}

async function loadAssignment(
  supabase: SupabaseClient,
  masterlistId: string,
): Promise<ProofReviewAssignment | null> {
  const { data, error } = await supabase
    .from("assignments")
    .select("collector_user_id, remedial_user_id")
    .eq("masterlist_id", masterlistId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    collectorUserId: (data.collector_user_id as string | null) ?? null,
    remedialUserId: (data.remedial_user_id as string | null) ?? null,
  };
}

/** Resolves the single user to notify for a new proof; `null` when none. */
export async function getProofReviewRecipient(
  supabase: SupabaseClient,
  masterlistId: string,
): Promise<string | null> {
  const assignment = await loadAssignment(supabase, masterlistId);
  return assignment ? chooseProofReviewRecipient(assignment) : null;
}

/** Loads what the review route needs to authorize and notify for a payment. */
export async function getPaymentReviewContext(
  supabase: SupabaseClient,
  paymentId: string,
): Promise<{ applicationId: string; assignment: ProofReviewAssignment } | null> {
  const { data: payment, error } = await supabase
    .from("payments")
    .select("loan_application_id, masterlist_id")
    .eq("id", paymentId)
    .maybeSingle();

  if (error || !payment) return null;

  const assignment = await loadAssignment(
    supabase,
    payment.masterlist_id as string,
  );
  if (!assignment) return null;

  return {
    applicationId: payment.loan_application_id as string,
    assignment,
  };
}
