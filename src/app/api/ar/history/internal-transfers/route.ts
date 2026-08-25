import { resolveDateBounds, type DateRangeValue } from "@/components/history";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  clampArHistoryPageSize,
  getInternalTransferHistory,
  getInternalTransferKpiCounts,
  type InternalTransferSortKey,
} from "@/lib/ar/history";
import { requireModulePermission } from "@/lib/permissions/server";
import { createServiceClient } from "@/lib/supabase/server";

const RANGE_PRESETS = new Set(["30d", "90d", "all", "custom"]);
const SORT_KEYS = new Set(["borrower", "amount", "reviewedAt"]);
const SEGMENTS = new Set(["all", "seafarer", "sme", "individual"]);

/**
 * Internal transfer (Other Loan / Offset) history: posted and rejected
 * transfers, across all accounts. Read-only. Uses the service-role client
 * — this join crosses loan_applications plus two separate masterlist FKs
 * (source and target), the same shape `listPendingInternalTransfers`'s
 * route already needed service-role for.
 */
export async function GET(request: Request) {
  try {
    await requireModulePermission("accounting_ar", "view");
    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search") ?? "";
    const segmentRaw = searchParams.get("segment") ?? "all";
    const segment = (
      SEGMENTS.has(segmentRaw) ? segmentRaw : "all"
    ) as "all" | "seafarer" | "sme" | "individual";

    const rangeRaw = searchParams.get("range") ?? "30d";
    const preset = (
      RANGE_PRESETS.has(rangeRaw) ? rangeRaw : "30d"
    ) as DateRangeValue["preset"];
    const dateRange: DateRangeValue = {
      preset,
      from: searchParams.get("from") ?? "",
      to: searchParams.get("to") ?? "",
    };
    const { from, to } = resolveDateBounds(dateRange, new Date());

    const sortKeyRaw = searchParams.get("sortKey") ?? "reviewedAt";
    const sortKey = (
      SORT_KEYS.has(sortKeyRaw) ? sortKeyRaw : "reviewedAt"
    ) as InternalTransferSortKey;
    const sortDirRaw = searchParams.get("sortDir") ?? "desc";
    const sortDir = sortDirRaw === "asc" ? "asc" : "desc";

    const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
    const pageSize = clampArHistoryPageSize(
      Number(searchParams.get("pageSize") ?? 10),
    );

    const supabase = createServiceClient();
    const [history, kpi] = await Promise.all([
      getInternalTransferHistory(supabase, {
        search,
        segment,
        from,
        to,
        sortKey,
        sortDir,
        page,
        pageSize,
      }),
      getInternalTransferKpiCounts(supabase, { from, to }),
    ]);

    return jsonOk({
      rows: history.rows,
      totalCount: history.totalCount,
      kpi,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
