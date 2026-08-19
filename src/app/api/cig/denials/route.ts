import { handleApiError, jsonOk } from "@/lib/api/handler";
import { getPendingDenialCalls } from "@/lib/cig/denials";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

const SEGMENT_FILTERS = new Set(["all", "seafarer", "sme", "individual"]);

/** Denied files waiting for CIG's courtesy call to the borrower. */
export async function GET(request: Request) {
  try {
    await requireModulePermission("verification", "view");
    const { searchParams } = new URL(request.url);

    const segmentRaw = searchParams.get("segment") ?? "all";
    const segment = (
      SEGMENT_FILTERS.has(segmentRaw) ? segmentRaw : "all"
    ) as "all" | "seafarer" | "sme" | "individual";

    const supabase = await createClient();
    const denials = await getPendingDenialCalls(supabase, { segment });
    return jsonOk({ denials });
  } catch (error) {
    return handleApiError(error);
  }
}
