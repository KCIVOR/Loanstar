import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { cancelApplication } from "@/lib/cig/cancel";
import { assertCigVerificationStage } from "@/lib/cig/queue-guards";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const cancelSchema = z.object({
  reason: z.string().min(3),
});

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("verification", "execute_trigger");
    const { id } = await params;
    const body = cancelSchema.parse(await request.json());
    const supabase = await createClient();
    await assertCigVerificationStage(supabase, id);

    const { cancellationId } = await cancelApplication(supabase, {
      applicationId: id,
      reason: body.reason,
      actorId: user.id,
    });

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "verification",
      action: "execute_trigger",
      entityType: "application_cancellation",
      entityId: cancellationId,
      afterData: { applicationId: id, reason: body.reason },
    });

    return jsonOk({
      cancellation: { id: cancellationId, reason: body.reason },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
