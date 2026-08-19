import { handleApiError, jsonOk } from "@/lib/api/handler";
import { computeOriginationMetrics } from "@/lib/reports/metrics/origination";
import { parsePeriod } from "@/lib/reports/period";
import { requireModulePermission } from "@/lib/permissions/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    await requireModulePermission("reports", "view");
    const supabase = createServiceClient();
    const period = parsePeriod(new URL(request.url).searchParams);
    const origination = await computeOriginationMetrics(supabase, period);
    return jsonOk({
      period,
      metrics: origination.metrics,
      series: origination.series,
      stuckFiles: origination.stuckFiles,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
