import { resolveDateBounds, type DateRangeValue } from "@/components/history";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  clampCigHistoryPageSize,
  getCigForwardedHistory,
  getCigForwardedKpiCounts,
  type CigForwardedSortKey,
  type CigRecentFindingFilter,
} from "@/lib/cig/history";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

const RANGE_PRESETS = new Set(["30d", "90d", "all", "custom"]);
const SORT_KEYS = new Set(["forwardedAt", "applicationNo", "borrower"]);
const FINDINGS = new Set(["all", "positive", "negative"]);
const SEGMENT_FILTERS = new Set(["all", "seafarer", "sme"]);

/** Forwarded-to-Committee history. Read-only. */
export async function GET(request: Request) {
  try {
    await requireModulePermission("verification", "view");
    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search") ?? "";
    const findingRaw = searchParams.get("finding") ?? "all";
    const finding = (
      FINDINGS.has(findingRaw) ? findingRaw : "all"
    ) as CigRecentFindingFilter;

    const segmentRaw = searchParams.get("segment") ?? "all";
    const segment = (
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

    const sortKeyRaw = searchParams.get("sortKey") ?? "forwardedAt";
    const sortKey = (
      SORT_KEYS.has(sortKeyRaw) ? sortKeyRaw : "forwardedAt"
    ) as CigForwardedSortKey;
    const sortDirRaw = searchParams.get("sortDir") ?? "desc";
    const sortDir = sortDirRaw === "asc" ? "asc" : "desc";

    const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
    const pageSize = clampCigHistoryPageSize(
      Number(searchParams.get("pageSize") ?? 10),
    );

    const supabase = await createClient();
    const [history, kpi] = await Promise.all([
      getCigForwardedHistory(supabase, {
        search,
        finding,
        segment,
        from,
        to,
        sortKey,
        sortDir,
        page,
        pageSize,
      }),
      getCigForwardedKpiCounts(supabase, { from, to }),
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
