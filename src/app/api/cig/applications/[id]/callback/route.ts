import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { assertCigVerificationStage } from "@/lib/cig/queue";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const callbackSchema = z.object({
  scheduledAt: z.string().datetime(),
  notes: z.string().optional(),
});

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("verification", "edit");
    const { id } = await params;
    const body = callbackSchema.parse(await request.json());
    const supabase = await createClient();
    await assertCigVerificationStage(supabase, id);

    const { data: callback, error } = await supabase
      .from("callbacks")
      .insert({
        loan_application_id: id,
        scheduled_at: body.scheduledAt,
        notes: body.notes ?? null,
        recorded_by: user.id,
      })
      .select("id, scheduled_at, notes, created_at")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "verification",
      action: "execute_trigger",
      entityType: "callback",
      entityId: callback.id,
      afterData: {
        applicationId: id,
        scheduledAt: body.scheduledAt,
      },
    });

    return jsonOk({ callback });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
