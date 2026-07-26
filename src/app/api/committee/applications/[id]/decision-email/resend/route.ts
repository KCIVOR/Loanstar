import { NextResponse } from "next/server";

import { handleApiError, jsonOk } from "@/lib/api/handler";
import { getLatestCommitteeAction } from "@/lib/committee/actions";
import { attemptApplicationApprovedEmail } from "@/lib/committee/approval-email";
import { attemptApplicationDeniedEmail } from "@/lib/committee/denial-email";
import { getApplicationForStaff } from "@/lib/csa/application";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("committee", "execute_trigger");
    const { id } = await params;
    const supabase = await createClient();

    const application = await getApplicationForStaff(supabase, id);
    const latestAction = await getLatestCommitteeAction(supabase, id);

    if (
      !latestAction ||
      (latestAction.action !== "approve" && latestAction.action !== "deny")
    ) {
      return NextResponse.json(
        { error: "Resend is only available after Approve or Deny." },
        { status: 400 },
      );
    }

    if (
      application.status !== "approved" &&
      application.status !== "denied"
    ) {
      return NextResponse.json(
        { error: "Application is not in an approved or denied state." },
        { status: 400 },
      );
    }

    const borrowerRaw = application.borrowers;
    const borrower = Array.isArray(borrowerRaw)
      ? borrowerRaw[0]
      : borrowerRaw;
    const borrowerPayload = borrower
      ? {
          email: borrower.email as string | null,
          first_name: borrower.first_name as string | null,
          last_name: borrower.last_name as string | null,
          user_id: borrower.user_id as string | null,
        }
      : null;

    const result =
      latestAction.action === "approve"
        ? await attemptApplicationApprovedEmail({
            actorId: user.id,
            applicationId: id,
            supabase,
            borrower: borrowerPayload,
            isResend: true,
          })
        : await attemptApplicationDeniedEmail({
            actorId: user.id,
            applicationId: id,
            supabase,
            borrower: borrowerPayload,
            isResend: true,
          });

    return jsonOk({
      emailSent: result.emailSent,
      reason: result.emailSent
        ? undefined
        : !borrowerPayload?.email?.trim()
          ? "borrower_email_missing"
          : undefined,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
