import { resolveDateBounds, type DateRangeValue } from "@/components/history";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  clampLraQueuePageSize,
  getLraQueue,
  getLraQueueKpiCounts,
  type LraQueueScope,
  type LraQueueSortKey,
} from "@/lib/lra/queue";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

const SCOPES = new Set(["active", "completed", "all"]);
const RANGE_PRESETS = new Set(["30d", "90d", "all", "custom"]);
const SORT_KEYS = new Set(["priority", "queued", "status"]);

/** Param-driven LRA release queue → `{ rows, totalCount, kpi }`. */
export async function GET(request: Request) {
  try {
    await requireModulePermission("release_lra", "view");
    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search") ?? "";
    const scopeRaw = searchParams.get("scope") ?? "active";
    const scope = (
      SCOPES.has(scopeRaw) ? scopeRaw : "active"
    ) as LraQueueScope;

    // Application status (same field as the page Status dropdown).
    const statusFilter = searchParams.get("status") ?? "all";

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
    const sortKey = (
      SORT_KEYS.has(sortKeyRaw) ? sortKeyRaw : "priority"
    ) as LraQueueSortKey;
    const sortDirRaw = searchParams.get("sortDir") ?? "asc";
    const sortDir = sortDirRaw === "desc" ? "desc" : "asc";

    const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
    const pageSize = clampLraQueuePageSize(
      Number(searchParams.get("pageSize") ?? 10),
    );

    const supabase = await createClient();
    const [queue, kpi] = await Promise.all([
      getLraQueue(supabase, {
        search,
        scope,
        statusFilter,
        from,
        to,
        sortKey,
        sortDir,
        page,
        pageSize,
      }),
      getLraQueueKpiCounts(supabase),
    ]);

    return jsonOk({
      rows: queue.rows,
      totalCount: queue.totalCount,
      kpi,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
