import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { rejectDcr } from "@/lib/ar/posting";
import {
  notifyBorrowerForApplication,
  notifyUser,
} from "@/lib/notifications/write";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const schema = z.object({
  reason: z.string().trim().min(3),
});

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission(
      "accounting_ar",
      "execute_trigger",
    );
    const { id } = await params;
    const body = schema.parse(await request.json());
    const supabase = await createClient();

    const result = await rejectDcr(supabase, id, user.id, body.reason);

    await notifyUser({
      userId: result.collectorUserId,
      title: "DCRR rejected",
      body: `AR rejected your DCRR: ${body.reason}`,
      kind: "dcr_rejected",
      entityType: "dcr",
      entityId: id,
      link: "/collector/dcr/history",
    });

    for (const applicationId of result.loanApplicationIds) {
      await notifyBorrowerForApplication(applicationId, {
        title: "Payment needs re-verification",
        body: "Your recent payment report was returned for correction. Your account balance will update once it's re-processed — no action needed from you.",
        kind: "dcr_rejected",
        entityType: "dcr",
        entityId: id,
      });
    }

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "accounting_ar",
      action: "execute_trigger",
      entityType: "dcr",
      entityId: id,
      afterData: {
        trigger: "reject_dcr",
        reason: body.reason,
        collectorUserId: result.collectorUserId,
        affectedApplications: result.loanApplicationIds,
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
