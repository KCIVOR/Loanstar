import { handleApiError, jsonOk } from "@/lib/api/handler";
import { getCigScheduledCallbacks } from "@/lib/cig/history";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

const SEGMENT_FILTERS = new Set(["all", "seafarer", "sme", "individual"]);

/** Active callbacks still in the future — hidden from the work queue until due. */
export async function GET(request: Request) {
  try {
    await requireModulePermission("verification", "view");
    const { searchParams } = new URL(request.url);

    const segmentRaw = searchParams.get("segment") ?? "all";
    const segment = (
      SEGMENT_FILTERS.has(segmentRaw) ? segmentRaw : "all"
    ) as "all" | "seafarer" | "sme" | "individual";

    const supabase = await createClient();
    const scheduledCallbacks = await getCigScheduledCallbacks(supabase, {
      segment,
    });
    return jsonOk({ scheduledCallbacks });
  } catch (error) {
    return handleApiError(error);
  }
}
