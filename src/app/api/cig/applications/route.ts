import { resolveDateBounds, type DateRangeValue } from "@/components/history";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  cigQueueSearchPredicate,
  clampCigQueuePageSize,
  computeCigQueueKpis,
  getCigQueue,
  inEndorsedAtBounds,
  passesWorkFilter,
  sortCigQueue,
  workFilterSpec,
  type CigQueueSortKey,
} from "@/lib/cig/queue";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

const RANGE_PRESETS = new Set(["30d", "90d", "all", "custom"]);
const SORT_KEYS = new Set<CigQueueSortKey>([
  "priority",
  "endorsed",
  "waiting",
  "status",
]);

export async function GET(request: Request) {
  try {
    await requireModulePermission("verification", "view");
    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search") ?? "";
    const workRaw =
      searchParams.get("work") ?? searchParams.get("filter") ?? "all";
    const workFilter = workFilterSpec(workRaw);

    // Active queue defaults to All time (must not hide old-but-still-open items).
    const rangeRaw = searchParams.get("range") ?? "all";
    const preset = (
      RANGE_PRESETS.has(rangeRaw) ? rangeRaw : "all"
    ) as DateRangeValue["preset"];
    const dateRange: DateRangeValue = {
      preset,
      from: searchParams.get("from") ?? "",
      to: searchParams.get("to") ?? "",
    };
    const { from, to } = resolveDateBounds(dateRange, new Date());

    const sortKeyRaw = searchParams.get("sortKey") ?? "priority";
    const sortKey: CigQueueSortKey = SORT_KEYS.has(
      sortKeyRaw as CigQueueSortKey,
    )
      ? (sortKeyRaw as CigQueueSortKey)
      : "priority";
    const sortDirRaw = searchParams.get("sortDir") ?? "asc";
    const sortDir = sortDirRaw === "desc" ? "desc" : "asc";

    const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
    const pageSize = clampCigQueuePageSize(
      Number(searchParams.get("pageSize") ?? 10),
    );

    const supabase = await createClient();

    // Fetch the classified CIG queue superset, then filter/sort/paginate in JS:
    // revision routing + callback overdue/hidden are computed (not plain SQL
    // columns) and volume is desk-bounded — same justification as Remedial/Collector.
    const applications = await getCigQueue(supabase);
    const kpi = computeCigQueueKpis(applications);

    const filtered = applications.filter(
      (row) =>
        inEndorsedAtBounds(row.endorsedAt, from, to) &&
        passesWorkFilter(row, workFilter) &&
        cigQueueSearchPredicate(row, search),
    );
    const sorted = sortCigQueue(filtered, sortKey, sortDir);

    const totalCount = sorted.length;
    const rows = sorted.slice((page - 1) * pageSize, page * pageSize);

    return jsonOk({
      rows,
      totalCount,
      kpi,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
