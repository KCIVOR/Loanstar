import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { markCallbackResolved } from "@/lib/cig/history";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const callbackResolvedSchema = z.object({
  callbackId: z.string().min(1),
});

/**
 * CIG confirms a scheduled callback was handled.
 * Sets `callbacks.resolved_at` (call tracking only; no email).
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("verification", "edit");
    const { id } = await params;
    const body = callbackResolvedSchema.parse(await request.json());
    const supabase = await createClient();

    const { callbackId } = await markCallbackResolved(
      supabase,
      id,
      body.callbackId,
    );

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "verification",
      action: "execute_trigger",
      entityType: "callback",
      entityId: callbackId,
      afterData: { trigger: "cig_callback_resolved", applicationId: id },
    });

    return jsonOk({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
