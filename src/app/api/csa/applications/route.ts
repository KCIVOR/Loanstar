import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveDateBounds, type DateRangeValue } from "@/components/history";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  createApplicationSchema,
  createCsaApplication,
} from "@/lib/csa/create-application";
import {
  CSA_QUEUE_PAGE_SIZES,
  getCsaQueue,
  getCsaQueueKpiCounts,
  type CsaQueueSortKey,
  type CsaWorkFilter,
} from "@/lib/csa/queue";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

const WORK_FILTERS = new Set([
  "all",
  "attention",
  "documents",
  "negotiation",
]);
const SEGMENT_FILTERS = new Set(["all", "seafarer", "sme"]);
const RANGE_PRESETS = new Set(["30d", "90d", "all", "custom"]);
const SORT_KEYS = new Set([
  "borrower",
  "type",
  "status",
  "filed",
  "waiting",
]);

export async function GET(request: Request) {
  try {
    await requireModulePermission("intake", "view");
    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search") ?? "";
    const workRaw = searchParams.get("work") ?? "all";
    const workFilter = (
      WORK_FILTERS.has(workRaw) ? workRaw : "all"
    ) as CsaWorkFilter;

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
    ) as CsaQueueSortKey | undefined;
    const sortDirRaw = searchParams.get("sortDir") ?? "desc";
    const sortDir = sortDirRaw === "asc" ? "asc" : "desc";

    const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
    const pageSizeRaw = Number(searchParams.get("pageSize") ?? 10);
    const pageSize = (CSA_QUEUE_PAGE_SIZES as readonly number[]).includes(
      pageSizeRaw,
    )
      ? pageSizeRaw
      : 10;

    const supabase = await createClient();
    const [queue, kpi] = await Promise.all([
      getCsaQueue(supabase, {
        search,
        workFilter,
        segment: segmentFilter,
        from,
        to,
        sortKey,
        sortDir,
        page,
        pageSize,
      }),
      getCsaQueueKpiCounts(supabase),
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

export async function POST(request: Request) {
  try {
    const user = await requireModulePermission("intake", "create");
    const body = createApplicationSchema.parse(await request.json());
    const supabase = await createClient();
    const result = await createCsaApplication(supabase, user.id, body);
    return jsonOk({ applicationId: result.applicationId }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
