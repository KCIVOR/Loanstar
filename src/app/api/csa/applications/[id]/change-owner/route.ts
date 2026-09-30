import { NextResponse } from "next/server";
import { z } from "zod";
import { formatZodError } from "@/lib/api/zod-error";

import { handleApiError, jsonOk, ValidationError } from "@/lib/api/handler";
import { writeAuditEvent } from "@/lib/audit/writer";
import { reassignApplicationBorrowerAccount } from "@/lib/csa/connect-borrower";
import { notifyUser } from "@/lib/notifications/write";
import { requireModulePermission } from "@/lib/permissions/server";

type RouteParams = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  targetBorrowerId: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(10, "Please give a reason of at least 10 characters")
    .max(500, "Reason must be at most 500 characters"),
});

// Business-rule refusals raised by the RPC — shown to the CSA as a 400.
const RPC_RULE_MESSAGES = [
  "A reason of at least 10 characters is required",
  "Owner cannot be changed at this stage",
  "Application is not linked to a borrower account",
  "Application already belongs to that borrower",
  "Selected borrower record not found",
  "Selected borrower does not have a portal account",
];

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("intake", "edit");
    const { id } = await params;
    const body = bodySchema.parse(await request.json());

    let result;
    try {
      result = await reassignApplicationBorrowerAccount(
        id,
        body.targetBorrowerId,
        user.id,
        body.reason,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (RPC_RULE_MESSAGES.some((m) => message.startsWith(m))) {
        throw new ValidationError(message);
      }
      throw error;
    }

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "intake",
      action: "edit",
      entityType: "loan_application",
      entityId: id,
      beforeData: { borrowerId: result.previousBorrowerId },
      afterData: {
        trigger: "csa_change_application_owner",
        newBorrowerId: result.borrowerId,
        reason: body.reason,
      },
    });

    await notifyUser({
      userId: result.borrowerUserId,
      title: "Loan application linked to your account",
      body: "A Loan Star application has been linked to your borrower account. You can now review it in your portal.",
      link: "/borrower",
      kind: "application_owner_changed_in",
      entityType: "loan_application",
      entityId: id,
    });

    await notifyUser({
      userId: result.previousUserId,
      title: "A loan application was moved from your account",
      body: "A Loan Star application was moved to another borrower account by our staff. Please contact your branch if you have questions.",
      link: null,
      kind: "application_owner_changed_out",
      entityType: "loan_application",
      entityId: id,
    });

    return jsonOk({ borrowerId: result.borrowerId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: formatZodError(error) }, { status: 400 });
    }
    return handleApiError(error);
  }
}
