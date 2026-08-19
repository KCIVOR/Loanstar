import { handleApiError, jsonOk } from "@/lib/api/handler";
import { requireModulePermission } from "@/lib/permissions/server";
import { fetchPastDueRegister } from "@/lib/reports/register-queries";
import { sortByOutstandingDesc, type PastDueAging } from "@/lib/reports/registers";
import {
  parseReportCollateral,
  parseReportSegment,
} from "@/lib/reports/segments";
import { createServiceClient } from "@/lib/supabase/server";

const AGING = new Set<PastDueAging>(["all", "1-30", "31-60", "61-90", "91+", "par30"]);

function parseAging(value: string | null): PastDueAging {
  if (value && AGING.has(value as PastDueAging)) return value as PastDueAging;
  return "all";
}

export async function GET(request: Request) {
  try {
    await requireModulePermission("reports", "view");
    const params = new URL(request.url).searchParams;
    const aging = parseAging(params.get("aging"));
    const segment = parseReportSegment(params.get("segment"));
    const collateral = parseReportCollateral(params.get("collateral"));
    const supabase = createServiceClient();
    const rows = sortByOutstandingDesc(await fetchPastDueRegister(supabase, aging)).filter(
      (row) =>
        (segment === "all" || row.segment === segment) &&
        (collateral === "all" || row.collateralType === collateral),
    );
    const outstanding = rows.reduce((sum, row) => sum + row.outstanding, 0);
    return jsonOk({
      rows,
      kpis: { count: rows.length, outstanding },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
