import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  ensureDocumentSlots,
  getCompletionSummary,
  getStageChecklist,
} from "@/lib/documents/checklist";
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

    await ensureDocumentSlots(
      supabase,
      stageParam,
      application.id,
      application.borrowerId,
    );

    const items = await getStageChecklist(
      supabase,
      stageParam,
      application.id,
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
