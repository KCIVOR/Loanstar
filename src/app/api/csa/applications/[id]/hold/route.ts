import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { assertCsaCanEdit } from "@/lib/csa/application";
import { recordApplicationHold } from "@/lib/csa/record-hold";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const holdSchema = z.object({
  reason: z.string().min(3),
});

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("intake", "edit");
    const { id } = await params;
    const body = holdSchema.parse(await request.json());
    const supabase = await createClient();
    await assertCsaCanEdit(supabase, id);

    const { holdId } = await recordApplicationHold(supabase, {
      applicationId: id,
      reason: body.reason,
      actorId: user.id,
    });

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "intake",
      action: "execute_trigger",
      entityType: "file_hold",
      entityId: holdId,
      afterData: { applicationId: id, reason: body.reason },
    });

    return jsonOk({
      hold: { id: holdId, reason: body.reason },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
