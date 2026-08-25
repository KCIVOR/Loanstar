import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { rejectInternalTransfer } from "@/lib/ar/internal-transfers";
import { requireModulePermission } from "@/lib/permissions/server";
import { createServiceClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const rejectSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required"),
});

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("accounting_ar", "edit");
    const { id } = await params;
    const body = rejectSchema.parse(await request.json());

    const result = await rejectInternalTransfer(
      createServiceClient(),
      id,
      user.id,
      body.reason,
    );

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "accounting_ar",
      action: "execute_trigger",
      entityType: "internal_transfer",
      entityId: id,
      afterData: { trigger: "internal_transfer_rejected", reason: body.reason },
    });

    return jsonOk(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
