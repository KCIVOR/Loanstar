import { resolveDateBounds, type DateRangeValue } from "@/components/history";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  COMMITTEE_DECISION_ACTIONS,
  COMMITTEE_DECISION_PAGE_SIZES,
  getCommitteeDecisionHistory,
  getCommitteeHistoryKpiCounts,
  type CommitteeDecisionAction,
  type CommitteeHistorySortKey,
} from "@/lib/committee/history";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

const ACTIONS = new Set(["all", ...COMMITTEE_DECISION_ACTIONS]);
const RANGE_PRESETS = new Set(["30d", "90d", "all", "custom"]);
const SORT_KEYS = new Set([
  "applicationNo",
  "borrower",
  "action",
  "actedAt",
]);

/** Decision history: append-only committee_actions log. Read-only. */
export async function GET(request: Request) {
  try {
    const user = await requireModulePermission("committee", "view");
    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search") ?? "";
    const actionRaw = searchParams.get("action") ?? "all";
    const action = (
      ACTIONS.has(actionRaw) ? actionRaw : "all"
    ) as CommitteeDecisionAction | "all";

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

    const sortKeyRaw = searchParams.get("sortKey") ?? "actedAt";
    const sortKey = (
      SORT_KEYS.has(sortKeyRaw) ? sortKeyRaw : "actedAt"
    ) as CommitteeHistorySortKey;
    const sortDirRaw = searchParams.get("sortDir") ?? "desc";
    const sortDir = sortDirRaw === "asc" ? "asc" : "desc";

    const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
    const pageSizeRaw = Number(searchParams.get("pageSize") ?? 10);
    const pageSize = (
      COMMITTEE_DECISION_PAGE_SIZES as readonly number[]
    ).includes(pageSizeRaw)
      ? pageSizeRaw
      : 10;

    const supabase = await createClient();
    const [history, kpi] = await Promise.all([
      getCommitteeDecisionHistory(supabase, user.id, {
        search,
        action,
        from,
        to,
        sortKey,
        sortDir,
        page,
        pageSize,
      }),
      getCommitteeHistoryKpiCounts(supabase, { from, to }),
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
