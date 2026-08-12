import { resolveDateBounds, type DateRangeValue } from "@/components/history";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  clampArHistoryPageSize,
  getReconciledDcrHistory,
  getReconciledDcrKpiCounts,
  type ReconciledDcrSortKey,
} from "@/lib/ar/history";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

const RANGE_PRESETS = new Set(["30d", "90d", "all", "custom"]);
const SORT_KEYS = new Set(["borrower", "amount", "postedAt"]);

/** Reconciled DCR posting history: one row per postings entry. Read-only. */
export async function GET(request: Request) {
  try {
    await requireModulePermission("accounting_ar", "view");
    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search") ?? "";

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

    const sortKeyRaw = searchParams.get("sortKey") ?? "postedAt";
    const sortKey = (
      SORT_KEYS.has(sortKeyRaw) ? sortKeyRaw : "postedAt"
    ) as ReconciledDcrSortKey;
    const sortDirRaw = searchParams.get("sortDir") ?? "desc";
    const sortDir = sortDirRaw === "asc" ? "asc" : "desc";

    const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
    const pageSize = clampArHistoryPageSize(
      Number(searchParams.get("pageSize") ?? 10),
    );

    const supabase = await createClient();
    const [history, kpi] = await Promise.all([
      getReconciledDcrHistory(supabase, {
        search,
        from,
        to,
        sortKey,
        sortDir,
        page,
        pageSize,
      }),
      getReconciledDcrKpiCounts(supabase, { from, to }),
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
