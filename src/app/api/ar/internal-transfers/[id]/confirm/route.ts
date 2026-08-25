import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { postInternalTransfer } from "@/lib/ar/internal-transfers";
import { requireModulePermission } from "@/lib/permissions/server";
import { createServiceClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("accounting_ar", "edit");
    const { id } = await params;

    const result = await postInternalTransfer(
      createServiceClient(),
      id,
      user.id,
    );

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "accounting_ar",
      action: "execute_trigger",
      entityType: "internal_transfer",
      entityId: id,
      afterData: { trigger: "internal_transfer_posted", newBalance: result.newBalance },
    });

    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
