import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  ensureDocumentSlots,
  getCompletionSummary,
  getStageChecklist,
} from "@/lib/documents/checklist";
import { excludeCsaOnlyIntakeItems } from "@/lib/documents/csa-only-intake";
import { STAGES } from "@/lib/constants";
import {
  ForbiddenError,
  requireModulePermission,
} from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

async function assertOwnApplication(userId: string, applicationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("loan_applications")
    .select(
      `
      id,
      borrower_id,
      segment,
      entity_type,
      borrowers!inner ( user_id )
    `,
    )
    .eq("id", applicationId)
    .single();

  if (error || !data) {
    throw new ForbiddenError("Application not found");
  }

  const borrowersRaw = data.borrowers;
  const borrower = Array.isArray(borrowersRaw) ? borrowersRaw[0] : borrowersRaw;

  if (borrower?.user_id !== userId) {
    throw new ForbiddenError("Application not found");
  }

  return {
    id: data.id as string,
    borrowerId: data.borrower_id as string,
    segment: (data.segment === "sme" || data.segment === "individual"
      ? data.segment
      : "seafarer") as "seafarer" | "sme" | "individual",
    entityType:
      data.entity_type === "individual" || data.entity_type === "corporate"
        ? (data.entity_type as "individual" | "corporate")
        : null,
  };
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("borrower_portal", "view");
    const { id } = await params;
    const supabase = await createClient();
    const application = await assertOwnApplication(user.id, id);
    const url = new URL(request.url);
    const stageParam = url.searchParams.get("stage") ?? "intake";

    if (!STAGES.includes(stageParam as (typeof STAGES)[number])) {
      throw new ForbiddenError("Invalid checklist stage");
    }

    const scope = {
      segment: application.segment,
      entityType: application.entityType,
    };

    await ensureDocumentSlots(
      supabase,
      stageParam,
      application.id,
      application.borrowerId,
      scope,
    );

    const items = excludeCsaOnlyIntakeItems(
      await getStageChecklist(supabase, stageParam, application.id, scope),
    );
    const summary = getCompletionSummary(items);

    return jsonOk({
      stage: stageParam,
      items,
      summary,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
