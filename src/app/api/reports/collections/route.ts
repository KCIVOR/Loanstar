import { handleApiError, jsonOk } from "@/lib/api/handler";
import { requireModulePermission } from "@/lib/permissions/server";
import { pickCollectionMetrics } from "@/lib/reports/collections-register";
import { computeMoneyMetrics } from "@/lib/reports/metrics/money";
import { parsePeriod } from "@/lib/reports/period";
import { fetchCollectorCollections } from "@/lib/reports/register-queries";
import { parseReportSegment } from "@/lib/reports/segments";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    await requireModulePermission("reports", "view");
    const searchParams = new URL(request.url).searchParams;
    const period = parsePeriod(searchParams);
    const segment = parseReportSegment(searchParams.get("segment"));
    const supabase = createServiceClient();

    const [money, collectors] = await Promise.all([
      computeMoneyMetrics(supabase, period),
      fetchCollectorCollections(supabase, period, segment),
    ]);

    return jsonOk({
      period,
      metrics: pickCollectionMetrics(money.metrics),
      collectors,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
