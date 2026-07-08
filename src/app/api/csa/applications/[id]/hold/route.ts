import { NextResponse } from "next/server";
import { z } from "zod";

import { appendStatusHistory } from "@/lib/applications/status";
import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { assertCsaCanEdit } from "@/lib/csa/application";
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

    const { data: hold, error: holdError } = await supabase
      .from("file_holds")
      .insert({
        loan_application_id: id,
        reason: body.reason,
        recorded_by: user.id,
      })
      .select("id, reason, created_at")
      .single();

    if (holdError) {
      throw new Error(holdError.message);
    }

    await appendStatusHistory(supabase, id, "on_hold", {
      actorId: user.id,
      note: body.reason,
    });

    await supabase
      .from("loan_applications")
      .update({ blocker: body.reason })
      .eq("id", id);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "intake",
      action: "execute_trigger",
      entityType: "file_hold",
      entityId: hold.id,
      afterData: { applicationId: id, reason: body.reason },
    });

    return jsonOk({ hold });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
