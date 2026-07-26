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
  isRevision: boolean;
  callbackOverdueAt: string | null;
};

/**
 * Active CIG queue: applications currently in verification, plus
 * for_revision files Committee routed back to CIG specifically (checked via
 * the open revisit_notices row, since "for_revision" alone is shared with
 * CSA-routed revisions). Files with a future callback are hidden until due;
 * ones with an already-due callback stay visible and are flagged overdue.
 */
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
    .in("status", ["for_verification", "for_revision"])
    .order("endorsed_at", { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error(error.message);
  }

  const revisionIds = (applications ?? [])
    .filter((row) => row.status === "for_revision")
    .map((row) => row.id as string);

  let cigRevisionIds = new Set<string>();
  if (revisionIds.length) {
    const { data: notices, error: noticeError } = await supabase
      .from("revisit_notices")
      .select("loan_application_id, route_to")
      .in("loan_application_id", revisionIds)
      .eq("route_to", "cig")
      .is("resolved_at", null);

    if (noticeError) {
      throw new Error(noticeError.message);
    }

    cigRevisionIds = new Set(
      (notices ?? []).map((n) => n.loan_application_id as string),
    );
  }

  const inQueue = (applications ?? []).filter(
    (row) =>
      row.status === "for_verification" ||
      cigRevisionIds.has(row.id as string),
  );

  const ids = inQueue.map((a) => a.id as string);
  if (!ids.length) return [];

  const { data: callbacks, error: cbError } = await supabase
    .from("callbacks")
    .select("loan_application_id, scheduled_at")
    .in("loan_application_id", ids)
    .is("resolved_at", null);

  if (cbError) {
    throw new Error(cbError.message);
  }

  const hiddenIds = new Set(
    (callbacks ?? [])
      .filter((c) => (c.scheduled_at as string) > now)
      .map((c) => c.loan_application_id as string),
  );

  const overdueTimes = new Map(
    (callbacks ?? [])
      .filter((c) => (c.scheduled_at as string) <= now)
      .map((c) => [c.loan_application_id as string, c.scheduled_at as string]),
  );

  return inQueue
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
        isRevision: row.status === "for_revision",
        callbackOverdueAt: overdueTimes.get(row.id as string) ?? null,
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
