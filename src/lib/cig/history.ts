import type { SupabaseClient } from "@supabase/supabase-js";

export type CigRecentVerification = {
  id: string;
  applicationNo: string | null;
  status: string;
  finding: "positive" | "negative" | null;
  forwardedAt: string | null;
  completedAt: string | null;
  borrower: {
    borrowerNo: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
};

export type CigScheduledCallback = {
  id: string;
  applicationId: string;
  applicationNo: string | null;
  scheduledAt: string;
  notes: string | null;
  borrower: {
    borrowerNo: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
};

const RECENT_LIMIT = 100;

export type CigRecentFindingFilter = "all" | "positive" | "negative";

export function cigRecentMatchesSearch(
  item: {
    applicationNo: string | null;
    borrower: {
      borrowerNo: string;
      firstName: string;
      lastName: string;
      email: string;
    } | null;
  },
  term: string,
): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  const name = item.borrower
    ? `${item.borrower.firstName} ${item.borrower.lastName}`.toLowerCase()
    : "";
  return (
    name.includes(q) ||
    (item.borrower?.borrowerNo.toLowerCase().includes(q) ?? false) ||
    (item.borrower?.email.toLowerCase().includes(q) ?? false) ||
    (item.applicationNo?.toLowerCase().includes(q) ?? false)
  );
}

export function cigRecentMatchesFinding(
  finding: "positive" | "negative" | null,
  filter: CigRecentFindingFilter,
): boolean {
  if (filter === "all") return true;
  return finding === filter;
}

export function cigRecentMatchesStatus(
  status: string,
  filter: string,
): boolean {
  if (filter === "all") return true;
  return status === filter;
}

/**
 * Files CIG already completed/forwarded — desk history, not active work.
 */
export async function getCigRecentVerifications(
  supabase: SupabaseClient,
  limit = RECENT_LIMIT,
): Promise<CigRecentVerification[]> {
  const { data, error } = await supabase
    .from("verifications")
    .select(
      `
      finding,
      forwarded_at,
      completed_at,
      loan_applications (
        id,
        application_no,
        status,
        borrowers (
          borrower_no,
          first_name,
          last_name,
          email
        )
      )
    `,
    )
    .not("forwarded_at", "is", null)
    .order("forwarded_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).flatMap((row) => {
    const application = Array.isArray(row.loan_applications)
      ? row.loan_applications[0]
      : row.loan_applications;
    if (!application) return [];

    const borrowerRaw = application.borrowers;
    const borrower = Array.isArray(borrowerRaw)
      ? borrowerRaw[0]
      : borrowerRaw;

    return [
      {
        id: application.id as string,
        applicationNo: (application.application_no as string | null) ?? null,
        status: application.status as string,
        finding: (row.finding as CigRecentVerification["finding"]) ?? null,
        forwardedAt: (row.forwarded_at as string | null) ?? null,
        completedAt: (row.completed_at as string | null) ?? null,
        borrower: borrower
          ? {
              borrowerNo: borrower.borrower_no as string,
              firstName: borrower.first_name as string,
              lastName: borrower.last_name as string,
              email: borrower.email as string,
            }
          : null,
      },
    ];
  });
}

/**
 * Active callbacks still in the future — hidden from the work queue until due.
 */
export async function getCigScheduledCallbacks(
  supabase: SupabaseClient,
): Promise<CigScheduledCallback[]> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("callbacks")
    .select(
      `
      id,
      scheduled_at,
      notes,
      loan_application_id,
      loan_applications (
        id,
        application_no,
        status,
        borrowers (
          borrower_no,
          first_name,
          last_name,
          email
        )
      )
    `,
    )
    .is("resolved_at", null)
    .gt("scheduled_at", now)
    .order("scheduled_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const allowed = new Set(["for_verification", "for_revision"]);

  return (data ?? []).flatMap((row) => {
    const application = Array.isArray(row.loan_applications)
      ? row.loan_applications[0]
      : row.loan_applications;
    if (!application) return [];
    if (!allowed.has(application.status as string)) return [];

    const borrowerRaw = application.borrowers;
    const borrower = Array.isArray(borrowerRaw)
      ? borrowerRaw[0]
      : borrowerRaw;

    return [
      {
        id: row.id as string,
        applicationId: application.id as string,
        applicationNo: (application.application_no as string | null) ?? null,
        scheduledAt: row.scheduled_at as string,
        notes: (row.notes as string | null) ?? null,
        borrower: borrower
          ? {
              borrowerNo: borrower.borrower_no as string,
              firstName: borrower.first_name as string,
              lastName: borrower.last_name as string,
              email: borrower.email as string,
            }
          : null,
      },
    ];
  });
}
