import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, jsonOk } from "@/lib/api/handler";
import { writeAuditEvent } from "@/lib/audit/writer";
import { connectApplicationToBorrowerAccount } from "@/lib/csa/connect-borrower";
import { notifyUser } from "@/lib/notifications/write";
import { requireModulePermission } from "@/lib/permissions/server";

type RouteParams = { params: Promise<{ id: string }> };

const bodySchema = z.object({ targetBorrowerId: z.string().uuid() });

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("intake", "edit");
    const { id } = await params;
    const body = bodySchema.parse(await request.json());
    const result = await connectApplicationToBorrowerAccount(
      id,
      body.targetBorrowerId,
      user.id,
    );

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "intake",
      action: "edit",
      entityType: "loan_application",
      entityId: id,
      afterData: {
        trigger: "csa_connect_borrower_account",
        newBorrowerId: result.borrowerId,
      },
    });

    await notifyUser({
      userId: result.borrowerUserId,
      title: "Loan application linked to your account",
      body: "A Loan Star application has been linked to your borrower account. You can now review it in your portal.",
      link: "/borrower",
      kind: "application_account_connected",
      entityType: "loan_application",
      entityId: id,
    });

    return jsonOk({ borrowerId: result.borrowerId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
