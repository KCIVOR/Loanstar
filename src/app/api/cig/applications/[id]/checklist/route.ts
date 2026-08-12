import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  getCompletionSummary,
  getStageChecklist,
  loadChecklistScope,
} from "@/lib/documents/checklist";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Read-only intake checklist for the CIG workspace. CIG can view borrower
 * attachments (RLS: intake view) but never uploads or confirms here.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireModulePermission("verification", "view");
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
