import { handleApiError, jsonOk } from "@/lib/api/handler";
import { writeAuditEvent } from "@/lib/audit/writer";
import {
  assertCollectorAssignment,
  loadOriginationPacket,
} from "@/lib/collection/origination-packet";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("collection", "view");
    const { id } = await params;
    const supabase = await createClient();
    const context = await assertCollectorAssignment(supabase, user.id, id);

    const admin = createServiceClient();
    const packet = await loadOriginationPacket(admin, context);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "collection",
      action: "case_file.view",
      entityType: "masterlist",
      entityId: context.masterlistId,
      afterData: {
        loanApplicationId: context.loanApplicationId,
        desk: "collector",
      },
    });

    return jsonOk(packet);
  } catch (error) {
    return handleApiError(error);
  }
}
