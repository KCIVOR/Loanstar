import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  getCompletionSummary,
  getStageChecklist,
  loadChecklistScope,
} from "@/lib/documents/checklist";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

/** Read-only intake checklist — Committee needs the most comprehensive view of the file, including attachments. */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireModulePermission("committee", "view");
    const { id } = await params;
    const supabase = await createClient();
    const scope = await loadChecklistScope(supabase, id);

    const items = await getStageChecklist(supabase, "intake", id, scope);
    const summary = getCompletionSummary(items);

    return jsonOk({ stage: "intake", items, summary });
  } catch (error) {
    return handleApiError(error);
  }
}
