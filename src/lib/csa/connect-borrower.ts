import type { SupabaseClient } from "@supabase/supabase-js";

import { appendStatusHistory } from "@/lib/applications/status";
import { createServiceClient } from "@/lib/supabase/server";

export type BorrowerAccountResult = {
  id: string;
  borrowerNo: string | null;
  fullName: string;
  email: string;
  mobilePhone: string | null;
};

/** Only borrowers with a linked portal account (`user_id` set) are valid
 * connect targets — searching the full borrowers table would surface other
 * walk-in records, which is exactly what this feature is meant to resolve. */
export async function searchBorrowerAccounts(
  supabase: SupabaseClient,
  term: string,
): Promise<BorrowerAccountResult[]> {
  const trimmed = term.trim();
  if (!trimmed) return [];

  const pattern = `"%${trimmed}%"`;
  const { data, error } = await supabase
    .from("borrowers")
    .select("id, borrower_no, first_name, middle_name, last_name, email, mobile_phone")
    .not("user_id", "is", null)
    .or(
      `first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern},borrower_no.ilike.${pattern}`,
    )
    .order("last_name")
    .limit(20);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    borrowerNo: (row.borrower_no as string) ?? null,
    fullName: [row.first_name, row.middle_name, row.last_name]
      .filter(Boolean)
      .join(" "),
    email: row.email as string,
    mobilePhone: (row.mobile_phone as string) ?? null,
  }));
}

/**
 * Re-points a walk-in application at an existing, portal-linked borrower
 * account. Only touches `loan_applications.borrower_id` — deliberately does
 * not merge/copy profile fields between the two `borrowers` rows, and does
 * not delete or edit the old walk-in row (its intake data stays exactly
 * where it is; it just stops being referenced by this application).
 *
 * Uses a service-role client for the actual write: `loan_applications`'
 * generic RLS update policy requires `is_csa_editable_status(status)`, so a
 * walk-in application already past intake (CIG/Committee/LRA) would
 * silently fail to update under the session client — same class of bug
 * already fixed for computation witness-signing.
 */
export async function connectApplicationToBorrowerAccount(
  supabase: SupabaseClient,
  applicationId: string,
  targetBorrowerId: string,
  actorId: string,
): Promise<{ borrowerId: string }> {
  const { data: application, error: appError } = await supabase
    .from("loan_applications")
    .select("id, status, borrower_id, borrowers ( user_id )")
    .eq("id", applicationId)
    .single();

  if (appError || !application) {
    throw new Error("Application not found");
  }

  const currentBorrowerRaw = application.borrowers;
  const currentBorrower = Array.isArray(currentBorrowerRaw)
    ? currentBorrowerRaw[0]
    : currentBorrowerRaw;
  if (currentBorrower?.user_id) {
    throw new Error("Application is already connected to a borrower account");
  }

  if (targetBorrowerId === application.borrower_id) {
    throw new Error("Application is already linked to that borrower record");
  }

  const { data: target, error: targetError } = await supabase
    .from("borrowers")
    .select("id, user_id, borrower_no, first_name, middle_name, last_name")
    .eq("id", targetBorrowerId)
    .maybeSingle();

  if (targetError) {
    throw new Error(targetError.message);
  }
  if (!target) {
    throw new Error("Selected borrower record not found");
  }
  if (!target.user_id) {
    throw new Error("Selected borrower does not have a portal account");
  }

  const admin = createServiceClient();
  const { error: updateError } = await admin
    .from("loan_applications")
    .update({ borrower_id: targetBorrowerId })
    .eq("id", applicationId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  // masterlist/documents/payments each carry their own denormalized
  // borrower_id (captured at row-creation time) that borrower-portal RLS
  // checks directly — it does NOT join through loan_applications.borrower_id.
  // Leaving these stale after a reconnect silently hides the borrower's own
  // loan, documents, and payment history from their own portal (confirmed
  // against masterlist_ar_select / documents_select / payments_select).
  // Scoped strictly to this application's rows — never touches any other
  // application's data.
  const targetFullName = [target.first_name, target.middle_name, target.last_name]
    .filter(Boolean)
    .join(" ");

  const { error: masterlistError } = await admin
    .from("masterlist")
    .update({
      borrower_id: targetBorrowerId,
      borrower_no: target.borrower_no,
      borrower_name: targetFullName,
    })
    .eq("loan_application_id", applicationId);
  if (masterlistError) {
    throw new Error(masterlistError.message);
  }

  const { error: documentsError } = await admin
    .from("documents")
    .update({ borrower_id: targetBorrowerId })
    .eq("loan_application_id", applicationId);
  if (documentsError) {
    throw new Error(documentsError.message);
  }

  const { error: paymentsError } = await admin
    .from("payments")
    .update({ borrower_id: targetBorrowerId })
    .eq("loan_application_id", applicationId);
  if (paymentsError) {
    throw new Error(paymentsError.message);
  }

  // Same status, not a transition — just logging the reconnection on the
  // application's timeline alongside the audit event.
  await appendStatusHistory(admin, applicationId, application.status as string, {
    actorId,
    note: "CSA connected application to an existing borrower account",
  });

  return { borrowerId: targetBorrowerId };
}
