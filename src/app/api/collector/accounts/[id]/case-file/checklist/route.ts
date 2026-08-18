import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  assertCollectorAssignment,
  loadIntakeChecklistForApplication,
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
    const checklist = await loadIntakeChecklistForApplication(
      admin,
      context.loanApplicationId,
    );

    return jsonOk(checklist);
  } catch (error) {
    return handleApiError(error);
  }
}
