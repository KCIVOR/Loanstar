import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, jsonOk } from "@/lib/api/handler";
import { writeAuditEvent } from "@/lib/audit/writer";
import { connectApplicationToBorrowerAccount } from "@/lib/csa/connect-borrower";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const bodySchema = z.object({ targetBorrowerId: z.string().uuid() });

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("intake", "edit");
    const { id } = await params;
    const body = bodySchema.parse(await request.json());
    const supabase = await createClient();

    const result = await connectApplicationToBorrowerAccount(
      supabase,
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

    return jsonOk(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
