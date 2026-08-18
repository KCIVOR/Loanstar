import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { reconcileDcrItem } from "@/lib/ar/posting";
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

    const result = await reconcileDcrItem(supabase, itemId, user.id, body);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "accounting_ar",
      action: "execute_trigger",
      entityType: "dcr_item",
      entityId: itemId,
      afterData: { trigger: "reconcile_dcr_item", ...result, ...body },
    });

    return jsonOk(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
