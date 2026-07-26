import { handleApiError, jsonOk } from "@/lib/api/handler";
import { getCigRecentVerifications } from "@/lib/cig/history";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

/** Desk history: files already forwarded to Committee. Read-only. */
export async function GET() {
  try {
    await requireModulePermission("verification", "view");
    const supabase = await createClient();
    const recent = await getCigRecentVerifications(supabase);
    return jsonOk({ recent });
  } catch (error) {
    return handleApiError(error);
  }
}
