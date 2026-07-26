import type { SupabaseClient } from "@supabase/supabase-js";

export type DenialCallItem = {
  noticeId: string;
  applicationId: string;
  applicationNo: string | null;
  deniedAt: string;
  borrower: {
    firstName: string;
    lastName: string;
    email: string;
    mobilePhone: string | null;
  } | null;
};

/**
 * Denied files waiting for CIG's courtesy call to the borrower. The written
 * denial email is already sent on committee Deny; CIG informs by phone without
 * disclosing the reason, then marks the call done.
 */
export async function getPendingDenialCalls(
  supabase: SupabaseClient,
): Promise<DenialCallItem[]> {
  const { data, error } = await supabase
    .from("denial_notices")
    .select(
      `
      id,
      loan_application_id,
      created_at,
      loan_applications (
        application_no,
        borrowers (
          first_name,
          last_name,
          email,
          mobile_phone
        )
      )
    `,
    )
    .is("informed_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => {
    const app = Array.isArray(row.loan_applications)
      ? row.loan_applications[0]
      : row.loan_applications;
    const borrowerRaw = app?.borrowers;
    const borrower = Array.isArray(borrowerRaw)
      ? borrowerRaw[0]
      : borrowerRaw;
    return {
      noticeId: row.id as string,
      applicationId: row.loan_application_id as string,
      applicationNo: (app?.application_no as string) ?? null,
      deniedAt: row.created_at as string,
      borrower: borrower
        ? {
            firstName: borrower.first_name as string,
            lastName: borrower.last_name as string,
            email: borrower.email as string,
            mobilePhone: (borrower.mobile_phone as string) ?? null,
          }
        : null,
    };
  });
}

export async function markDenialInformed(
  supabase: SupabaseClient,
  applicationId: string,
  actorId: string,
): Promise<{ noticeId: string }> {
  const { data, error } = await supabase
    .from("denial_notices")
    .update({
      informed_at: new Date().toISOString(),
      informed_by: actorId,
    })
    .eq("loan_application_id", applicationId)
    .is("informed_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("No pending denial call for this application");
  }

  return { noticeId: data.id as string };
}
