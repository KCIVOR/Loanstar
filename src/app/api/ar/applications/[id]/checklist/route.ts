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
    await requireModulePermission("accounting_ar", "view");
    const { id } = await params;
    const supabase = await createClient();
    const url = new URL(request.url);
    const stage = url.searchParams.get("stage") ?? "accounting";

    if (!STAGES.includes(stage as (typeof STAGES)[number])) {
      throw new Error("Invalid checklist stage");
    }

    const { data: app } = await supabase
      .from("loan_applications")
      .select("borrower_id")
      .eq("id", id)
      .single();

    if (!app?.borrower_id) {
      throw new Error("Application not found");
    }

    await ensureDocumentSlots(supabase, stage, id, app.borrower_id as string);

    const items = await getStageChecklist(supabase, stage, id);
    const summary = getCompletionSummary(items);

    return jsonOk({ stage, items, summary });
  } catch (error) {
    return handleApiError(error);
  }
}
