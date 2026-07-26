import { handleApiError, jsonOk } from "@/lib/api/handler";
import { getCigScheduledCallbacks } from "@/lib/cig/history";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

/** Active callbacks still in the future — hidden from the work queue until due. */
export async function GET() {
  try {
    await requireModulePermission("verification", "view");
    const supabase = await createClient();
    const scheduledCallbacks = await getCigScheduledCallbacks(supabase);
    return jsonOk({ scheduledCallbacks });
  } catch (error) {
    return handleApiError(error);
  }
}
