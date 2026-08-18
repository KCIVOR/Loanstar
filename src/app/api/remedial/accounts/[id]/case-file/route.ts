import { handleApiError, jsonOk } from "@/lib/api/handler";
import { writeAuditEvent } from "@/lib/audit/writer";
import {
  assertRemedialAssignment,
  loadOriginationPacket,
} from "@/lib/collection/origination-packet";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("remedial", "view");
    const { id } = await params;
    const supabase = await createClient();
    const context = await assertRemedialAssignment(supabase, user.id, id);

    const admin = createServiceClient();
    const packet = await loadOriginationPacket(admin, context);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "remedial",
      action: "case_file.view",
      entityType: "masterlist",
      entityId: context.masterlistId,
      afterData: {
        loanApplicationId: context.loanApplicationId,
        desk: "remedial",
      },
    });

    return jsonOk(packet);
  } catch (error) {
    return handleApiError(error);
  }
}
