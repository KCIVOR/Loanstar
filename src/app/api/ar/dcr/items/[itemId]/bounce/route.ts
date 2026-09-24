import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { bounceDcrItem } from "@/lib/ar/posting";
import {
  notifyBorrowerForApplication,
  notifyUser,
} from "@/lib/notifications/write";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ itemId: string }> };

const schema = z.object({
  depositReference: z.string().min(1),
  depositAmount: z.number().positive(),
  depositProofPath: z.string().optional(),
});

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("accounting_ar", "execute_trigger");
    const { itemId } = await params;
    const body = schema.parse(await request.json());
    const supabase = await createClient();

    const result = await bounceDcrItem(supabase, itemId, user.id, body);

    await notifyUser({
      userId: result.collectorUserId,
      title: "Check bounced",
      body: `AR recorded a bounced check on your DCRR: ${body.depositReference}`,
      kind: "dcr_bounced",
      entityType: "dcr_item",
      entityId: itemId,
      link: "/collector/dcr/history",
    });

    if (result.loanApplicationId) {
      await notifyBorrowerForApplication(result.loanApplicationId, {
        title: "A recent payment did not clear",
        body: "One of your recent check payments was returned by the bank. Your account balance is unaffected, but please arrange another payment for this due date.",
        kind: "dcr_bounced",
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
        trigger: "bounce_dcr_item",
        ...result,
        ...body,
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
