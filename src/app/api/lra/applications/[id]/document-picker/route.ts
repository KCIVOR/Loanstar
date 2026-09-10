import { handleApiError, jsonOk } from "@/lib/api/handler";
import { buildReleaseDocumentPicker } from "@/lib/lra/document-picker";
import {
  queryPickerItems,
  type PickerEligibilityFilter,
  type PickerStatusFilter,
} from "@/lib/lra/release-documents";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Paginated / searched / filtered view of the generate-modal document list.
 * The full candidate set is small, but search + filters + paging are resolved
 * here (not in the client) so the modal stays a thin view.
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    await requireModulePermission("release_lra", "view");
    const { id } = await params;
    const supabase = await createClient();
    const url = new URL(request.url);

    const { mode, items } = await buildReleaseDocumentPicker(supabase, id);

    const result = queryPickerItems(items, {
      search: url.searchParams.get("search") ?? undefined,
      eligibility:
        (url.searchParams.get("eligibility") as PickerEligibilityFilter | null) ??
        undefined,
      status:
        (url.searchParams.get("status") as PickerStatusFilter | null) ??
        undefined,
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
    });

    return jsonOk({ mode, ...result });
  } catch (error) {
    return handleApiError(error);
  }
}
