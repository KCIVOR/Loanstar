import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  ensureDocumentSlots,
  getCompletionSummary,
  getStageChecklist,
} from "@/lib/documents/checklist";
import { STAGES } from "@/lib/constants";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  try {
    await requireModulePermission("intake", "view");
    const { id } = await params;
    const supabase = await createClient();
    const url = new URL(request.url);
    const stage = url.searchParams.get("stage") ?? "intake";

    const { data: app } = await supabase
      .from("loan_applications")
      .select("borrower_id, segment, entity_type")
      .eq("id", id)
      .single();

    if (!app?.borrower_id) {
      throw new Error("Application not found");
    }

    if (!STAGES.includes(stage as (typeof STAGES)[number])) {
      throw new Error("Invalid checklist stage");
    }

    const scope = {
      segment: (app.segment === "sme" ? "sme" : "seafarer") as "seafarer" | "sme",
      entityType:
        app.entity_type === "individual" || app.entity_type === "corporate"
          ? (app.entity_type as "individual" | "corporate")
          : null,
    };

    await ensureDocumentSlots(
      supabase,
      stage,
      id,
      app.borrower_id as string,
      scope,
    );

    const items = await getStageChecklist(supabase, stage, id, scope);
    const summary = getCompletionSummary(items);

    return jsonOk({ stage, items, summary });
  } catch (error) {
    return handleApiError(error);
  }
}
