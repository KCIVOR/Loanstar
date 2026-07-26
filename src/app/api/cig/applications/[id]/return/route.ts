import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { assertCigVerificationStage } from "@/lib/cig/queue";
import { returnToCsa } from "@/lib/cig/receipt";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const returnSchema = z.object({
  note: z.string().trim().min(1, "A note for CSA is required"),
});

/** CIG receipt check failed — send the file back to CSA with a note. */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission(
      "verification",
      "execute_trigger",
    );
    const { id } = await params;
    const body = returnSchema.parse(await request.json());
    const supabase = await createClient();
    await assertCigVerificationStage(supabase, id);

    await returnToCsa(supabase, id, user.id, body.note);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "verification",
      action: "execute_trigger",
      entityType: "loan_application",
      entityId: id,
      afterData: {
        trigger: "cig_return_to_csa",
        status: "submitted",
        note: body.note,
      },
    });

    return jsonOk({ success: true, status: "submitted" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
