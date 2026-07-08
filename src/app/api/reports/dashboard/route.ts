import { handleApiError, jsonOk } from "@/lib/api/handler";
import { buildExecutiveSummary } from "@/lib/reports/aggregates";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    await requireModulePermission("reports", "view");
    const supabase = await createClient();
    const summary = await buildExecutiveSummary(supabase);
    return jsonOk(summary);
  } catch (error) {
    return handleApiError(error);
  }
}
