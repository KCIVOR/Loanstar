import { resolveDateBounds, type DateRangeValue } from "@/components/history";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  ACTIVE_COMMITTEE_STATUSES,
  COMMITTEE_QUEUE_PAGE_SIZES,
  getCommitteeQueue,
  getCommitteeQueueKpiCounts,
  type CommitteeQueueSortKey,
  type CommitteeStatusFilter,
} from "@/lib/committee/queue";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

const STATUS_FILTERS = new Set(["all", ...ACTIVE_COMMITTEE_STATUSES]);
const SEGMENT_FILTERS = new Set(["all", "seafarer", "sme"]);
const RANGE_PRESETS = new Set(["30d", "90d", "all", "custom"]);
const SORT_KEYS = new Set(["status", "tat", "forwarded"]);

export async function GET(request: Request) {
  try {
    await requireModulePermission("committee", "view");
    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search") ?? "";
    const statusRaw = searchParams.get("status") ?? "all";
    const statusFilter = (
      STATUS_FILTERS.has(statusRaw) ? statusRaw : "all"
    ) as CommitteeStatusFilter;

    const segmentRaw = searchParams.get("segment") ?? "all";
    const segmentFilter = (
      SEGMENT_FILTERS.has(segmentRaw) ? segmentRaw : "all"
    ) as "all" | "seafarer" | "sme";

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

    const sortKeyRaw = searchParams.get("sortKey");
    const sortKey = (
      sortKeyRaw && SORT_KEYS.has(sortKeyRaw) ? sortKeyRaw : undefined
    ) as CommitteeQueueSortKey | undefined;
    const sortDirRaw = searchParams.get("sortDir") ?? "desc";
    const sortDir = sortDirRaw === "asc" ? "asc" : "desc";

    const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
    const pageSizeRaw = Number(searchParams.get("pageSize") ?? 10);
    const pageSize = (
      COMMITTEE_QUEUE_PAGE_SIZES as readonly number[]
    ).includes(pageSizeRaw)
      ? pageSizeRaw
      : 10;

    const supabase = await createClient();
    const [queue, kpi] = await Promise.all([
      getCommitteeQueue(supabase, {
        search,
        statusFilter,
        segment: segmentFilter,
        from,
        to,
        sortKey,
        sortDir,
        page,
        pageSize,
      }),
      getCommitteeQueueKpiCounts(supabase),
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
