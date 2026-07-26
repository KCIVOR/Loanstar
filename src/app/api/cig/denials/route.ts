import { handleApiError, jsonOk } from "@/lib/api/handler";
import { getPendingDenialCalls } from "@/lib/cig/denials";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

/** Denied files waiting for CIG's courtesy call to the borrower. */
export async function GET() {
  try {
    await requireModulePermission("verification", "view");
    const supabase = await createClient();
    const denials = await getPendingDenialCalls(supabase);
    return jsonOk({ denials });
  } catch (error) {
    return handleApiError(error);
  }
}
