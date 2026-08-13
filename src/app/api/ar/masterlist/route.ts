import { NextResponse } from "next/server";

import { resolveDateBounds, type DateRangeValue } from "@/components/history";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { masterlistToCsv } from "@/lib/ar/masterlist";
import {
  MASTERLIST_QUEUE_PAGE_SIZES,
  getMasterlistQueue,
  getMasterlistQueueKpiCounts,
  type MasterlistQueueSortKey,
} from "@/lib/ar/queue";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

const RANGE_PRESETS = new Set(["30d", "90d", "all", "custom"]);
const SORT_KEYS = new Set(["status", "borrower", "balance"]);
const SEGMENT_FILTERS = new Set(["all", "seafarer", "sme"]);

export async function GET(request: Request) {
  try {
    await requireModulePermission("accounting_ar", "view");
    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search") ?? "";
    const statusFilter = searchParams.get("status") ?? "all";
    const agingFilter = searchParams.get("aging") ?? "all";
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
    ) as MasterlistQueueSortKey | undefined;
    const sortDirRaw = searchParams.get("sortDir") ?? "desc";
    const sortDir = sortDirRaw === "asc" ? "asc" : "desc";

    const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
    const pageSizeRaw = Number(searchParams.get("pageSize") ?? 10);
    const pageSize = (
      MASTERLIST_QUEUE_PAGE_SIZES as readonly number[]
    ).includes(pageSizeRaw)
      ? pageSizeRaw
      : 10;

    const supabase = await createClient();
    const [queue, kpi] = await Promise.all([
      getMasterlistQueue(supabase, {
        search,
        statusFilter,
        agingFilter,
        segmentFilter,
        from,
        to,
        sortKey,
        sortDir,
        page,
        pageSize,
      }),
      getMasterlistQueueKpiCounts(supabase),
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

export async function POST() {
  try {
    await requireModulePermission("accounting_ar", "view");
    const supabase = await createClient();

    const { data, error } = await supabase.from("masterlist").select("*");

    if (error) throw new Error(error.message);

    const csv = masterlistToCsv((data ?? []) as Array<Record<string, unknown>>);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="masterlist-export.csv"',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
