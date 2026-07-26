import type { SupabaseClient } from "@supabase/supabase-js";

import { writeAuditEvent } from "@/lib/audit/writer";
import { sendEmail } from "@/lib/email/send";
import { shouldSendChannel } from "@/lib/notifications/should-send-channel";

export type ApprovalBorrower = {
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  user_id?: string | null;
};

export type ApplicationApprovedEmailPayload = {
  to: string;
  templateSlug: "application_approved";
  variables: { borrower_name: string };
};

/** Build the approval notice email — borrower name only. */
export function buildApplicationApprovedEmail(
  borrower: ApprovalBorrower | null | undefined,
): ApplicationApprovedEmailPayload | null {
  const email = borrower?.email?.trim();
  if (!email) return null;

  const borrower_name = [borrower?.first_name, borrower?.last_name]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
    .trim();

  return {
    to: email,
    templateSlug: "application_approved",
    variables: { borrower_name: borrower_name || "Borrower" },
  };
}

/**
 * Sends the approval email after a successful committee Approve.
 * Failures are audited and never thrown — the decision must stand.
 */
export async function attemptApplicationApprovedEmail(opts: {
  actorId: string;
  applicationId: string;
  borrower: ApprovalBorrower | null | undefined;
  supabase: SupabaseClient;
  isResend?: boolean;
}): Promise<{ emailSent: boolean }> {
  const payload = buildApplicationApprovedEmail(opts.borrower);
  if (!payload) {
    await writeAuditEvent({
      actorId: opts.actorId,
      moduleSlug: "committee",
      action: "execute_trigger",
      entityType: "loan_application",
      entityId: opts.applicationId,
      afterData: {
        trigger: "committee_approve_email",
        applicationId: opts.applicationId,
        emailSent: false,
        reason: "borrower_email_missing",
        ...(opts.isResend ? { isResend: true } : {}),
      },
    });
    return { emailSent: false };
  }

  const channel = await shouldSendChannel(
    opts.supabase,
    opts.borrower?.user_id,
    "email",
  );
  if (!channel.allowed) {
    await writeAuditEvent({
      actorId: opts.actorId,
      moduleSlug: "committee",
      action: "execute_trigger",
      entityType: "loan_application",
      entityId: opts.applicationId,
      afterData: {
        trigger: "committee_approve_email",
        applicationId: opts.applicationId,
        emailSent: false,
        reason: channel.reason ?? "channel_pref_blocked",
        ...(opts.isResend ? { isResend: true } : {}),
      },
    });
    return { emailSent: false };
  }

  try {
    await sendEmail(payload);
    await writeAuditEvent({
      actorId: opts.actorId,
      moduleSlug: "committee",
      action: "execute_trigger",
      entityType: "loan_application",
      entityId: opts.applicationId,
      afterData: {
        trigger: "committee_approve_email",
        applicationId: opts.applicationId,
        emailSent: true,
        ...(opts.isResend ? { isResend: true } : {}),
      },
    });
    return { emailSent: true };
  } catch {
    await writeAuditEvent({
      actorId: opts.actorId,
      moduleSlug: "committee",
      action: "execute_trigger",
      entityType: "loan_application",
      entityId: opts.applicationId,
      afterData: {
        trigger: "committee_approve_email",
        applicationId: opts.applicationId,
        emailSent: false,
        ...(opts.isResend ? { isResend: true } : {}),
      },
    });
    return { emailSent: false };
  }
}
