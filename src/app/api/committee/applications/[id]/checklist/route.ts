import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  getCompletionSummary,
  getStageChecklist,
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

    const items = await getStageChecklist(supabase, "intake", id);
    const summary = getCompletionSummary(items);

    return jsonOk({ stage: "intake", items, summary });
  } catch (error) {
    return handleApiError(error);
  }
}
