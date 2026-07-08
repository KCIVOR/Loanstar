import type { SupabaseClient } from "@supabase/supabase-js";

import { ForbiddenError } from "@/lib/permissions/server";

export type CigQueueItem = {
  id: string;
  applicationNo: string | null;
  status: string;
  endorsedAt: string | null;
  createdAt: string;
  borrower: {
    borrowerNo: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  hasPendingCallback: boolean;
  callbackScheduledAt: string | null;
};

/** Active CIG queue: for_verification, excluding future callbacks. */
export async function getCigQueue(supabase: SupabaseClient): Promise<CigQueueItem[]> {
  const now = new Date().toISOString();

  const { data: applications, error } = await supabase
    .from("loan_applications")
    .select(
      `
      id,
      application_no,
      status,
      endorsed_at,
      created_at,
      borrowers (
        borrower_no,
        first_name,
        last_name,
        email
      )
    `,
    )
    .eq("status", "for_verification")
    .order("endorsed_at", { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error(error.message);
  }

  const ids = (applications ?? []).map((a) => a.id as string);
  if (!ids.length) return [];

  const { data: callbacks, error: cbError } = await supabase
    .from("callbacks")
    .select("loan_application_id, scheduled_at")
    .in("loan_application_id", ids)
    .is("resolved_at", null)
    .gt("scheduled_at", now);

  if (cbError) {
    throw new Error(cbError.message);
  }

  const hiddenIds = new Set(
    (callbacks ?? []).map((c) => c.loan_application_id as string),
  );

  const callbackTimes = new Map(
    (callbacks ?? []).map((c) => [
      c.loan_application_id as string,
      c.scheduled_at as string,
    ]),
  );

  return (applications ?? [])
    .filter((row) => !hiddenIds.has(row.id as string))
    .map((row) => {
      const borrower = Array.isArray(row.borrowers)
        ? row.borrowers[0]
        : row.borrowers;
      return {
        id: row.id as string,
        applicationNo: row.application_no as string | null,
        status: row.status as string,
        endorsedAt: row.endorsed_at as string | null,
        createdAt: row.created_at as string,
        borrower: borrower
          ? {
              borrowerNo: borrower.borrower_no as string,
              firstName: borrower.first_name as string,
              lastName: borrower.last_name as string,
              email: borrower.email as string,
            }
          : null,
        hasPendingCallback: callbackTimes.has(row.id as string),
        callbackScheduledAt: callbackTimes.get(row.id as string) ?? null,
      };
    });
}

export async function assertCigVerificationStage(
  supabase: SupabaseClient,
  applicationId: string,
) {
  const { data, error } = await supabase
    .from("loan_applications")
    .select("id, status")
    .eq("id", applicationId)
    .single();

  if (error || !data) {
    throw new ForbiddenError("Application not found");
  }

  if (data.status !== "for_verification") {
    throw new ForbiddenError("Application is not in verification stage");
  }

  return data;
}
