import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { rejectDcrItem } from "@/lib/ar/posting";
import {
  notifyBorrowerForApplication,
  notifyUser,
} from "@/lib/notifications/write";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ itemId: string }> };

const schema = z.object({
  reason: z.string().trim().min(3),
});

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission(
      "accounting_ar",
      "execute_trigger",
    );
    const { itemId } = await params;
    const body = schema.parse(await request.json());
    const supabase = await createClient();

    const result = await rejectDcrItem(supabase, itemId, user.id, body.reason);

    await notifyUser({
      userId: result.collectorUserId,
      title: "DCRR line item rejected",
      body: `AR rejected one payment on your DCRR: ${body.reason}`,
      kind: "dcr_rejected",
      entityType: "dcr_item",
      entityId: itemId,
      link: "/collector/dcr/history",
    });

    if (result.loanApplicationId) {
      await notifyBorrowerForApplication(result.loanApplicationId, {
        title: "Payment needs re-verification",
        body: "Your recent payment report was returned for correction. Your account balance will update once it's re-processed — no action needed from you.",
        kind: "dcr_rejected",
        entityType: "dcr_item",
        entityId: itemId,
      });
    }

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "accounting_ar",
      action: "execute_trigger",
      entityType: "dcr_item",
      entityId: itemId,
      afterData: {
        trigger: "reject_dcr_item",
        reason: body.reason,
        collectorUserId: result.collectorUserId,
        loanApplicationId: result.loanApplicationId,
      },
    });

    return jsonOk({ status: "rejected" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
