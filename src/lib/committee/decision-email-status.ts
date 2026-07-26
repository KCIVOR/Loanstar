import { createServiceClient } from "@/lib/supabase/server";

export type DecisionEmailTrigger =
  | "committee_approve_email"
  | "committee_deny_email";

export type DecisionEmailStatus = {
  sent: boolean;
  lastAttemptAt: string | null;
  lastEmailSent: boolean | null;
  lastFailureReason: string | null;
  borrowerEmail: string | null;
};

export type DecisionEmailAuditRow = {
  created_at: string;
  after_data: {
    trigger?: string;
    emailSent?: boolean;
    reason?: string;
    [key: string]: unknown;
  } | null;
};

export function decisionEmailTriggerForAction(
  action: string,
): DecisionEmailTrigger | null {
  if (action === "approve") return "committee_approve_email";
  if (action === "deny") return "committee_deny_email";
  return null;
}

/** Rows must already be filtered to one trigger and ordered newest-first. */
export function deriveDecisionEmailStatus(
  rowsNewestFirst: DecisionEmailAuditRow[],
  borrowerEmail: string | null | undefined,
): DecisionEmailStatus {
  const email = borrowerEmail?.trim() || null;
  if (rowsNewestFirst.length === 0) {
    return {
      sent: false,
      lastAttemptAt: null,
      lastEmailSent: null,
      lastFailureReason: null,
      borrowerEmail: email,
    };
  }

  const latest = rowsNewestFirst[0];
  const latestSent = Boolean(latest.after_data?.emailSent);
  const sent = rowsNewestFirst.some((r) => Boolean(r.after_data?.emailSent));
  const lastFailureReason =
    !latestSent && typeof latest.after_data?.reason === "string"
      ? latest.after_data.reason
      : null;

  return {
    sent,
    lastAttemptAt: latest.created_at,
    lastEmailSent: latestSent,
    lastFailureReason,
    borrowerEmail: email,
  };
}

export async function getCommitteeDecisionEmailStatus(opts: {
  applicationId: string;
  action: string;
  borrowerEmail: string | null | undefined;
}): Promise<DecisionEmailStatus | null> {
  const trigger = decisionEmailTriggerForAction(opts.action);
  if (!trigger) return null;

  const admin = createServiceClient();
  const { data, error } = await admin
    .from("audit_events")
    .select("created_at, after_data")
    .eq("module_slug", "committee")
    .eq("action", "execute_trigger")
    .eq("entity_type", "loan_application")
    .eq("entity_id", opts.applicationId)
    .eq("after_data->>trigger", trigger)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`Failed to load decision email status: ${error.message}`);
  }

  return deriveDecisionEmailStatus(
    (data ?? []) as DecisionEmailAuditRow[],
    opts.borrowerEmail,
  );
}
