import { resolveDateBounds, type DateRangeValue } from "@/components/history";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  CSA_HISTORY_PAGE_SIZES,
  getCsaApplicationHistory,
  getCsaHistoryKpiCounts,
  type CsaHistorySortKey,
  type CsaHistoryStatusGroup,
} from "@/lib/csa/history";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

const STATUS_GROUPS = new Set(["all", "in_progress", "denied", "released"]);
const SEGMENT_FILTERS = new Set(["all", "seafarer", "sme"]);
const RANGE_PRESETS = new Set(["30d", "90d", "all", "custom"]);
const SORT_KEYS = new Set([
  "applicationNo",
  "borrower",
  "status",
  "endorsedAt",
]);

/** Desk history: applications already endorsed to CIG. Read-only. */
export async function GET(request: Request) {
  try {
    await requireModulePermission("intake", "view");
    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search") ?? "";
    const statusRaw = searchParams.get("status") ?? "all";
    const statusGroup = (
      STATUS_GROUPS.has(statusRaw) ? statusRaw : "all"
    ) as CsaHistoryStatusGroup | "all";

    const segmentRaw = searchParams.get("segment") ?? "all";
    const segmentFilter = (
      SEGMENT_FILTERS.has(segmentRaw) ? segmentRaw : "all"
    ) as "all" | "seafarer" | "sme";

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

    const sortKeyRaw = searchParams.get("sortKey") ?? "endorsedAt";
    const sortKey = (
      SORT_KEYS.has(sortKeyRaw) ? sortKeyRaw : "endorsedAt"
    ) as CsaHistorySortKey;
    const sortDirRaw = searchParams.get("sortDir") ?? "desc";
    const sortDir = sortDirRaw === "asc" ? "asc" : "desc";

    const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
    const pageSizeRaw = Number(searchParams.get("pageSize") ?? 10);
    const pageSize = (CSA_HISTORY_PAGE_SIZES as readonly number[]).includes(
      pageSizeRaw,
    )
      ? pageSizeRaw
      : 10;

    const supabase = await createClient();
    const [history, kpi] = await Promise.all([
      getCsaApplicationHistory(supabase, {
        search,
        statusGroup,
        segment: segmentFilter,
        from,
        to,
        sortKey,
        sortDir,
        page,
        pageSize,
      }),
      getCsaHistoryKpiCounts(supabase, { from, to }),
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
