import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveDateBounds, type DateRangeValue } from "@/components/history";
import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  clampAgentLeadsQueuePageSize,
  getAgentLeadsQueue,
  getAgentLeadsQueueKpiCounts,
  type AgentLeadsSortKey,
} from "@/lib/agent/queue";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

const createLeadSchema = z.object({
  borrowerName: z.string().min(1).max(200),
  businessName: z.string().max(200).optional(),
  borrowerId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
});

const RANGE_PRESETS = new Set(["30d", "90d", "all", "custom"]);
const SORT_KEYS = new Set(["priority", "borrower", "created", "progress"]);
const STAGE_FILTERS = new Set([
  "all",
  "awaiting_link",
  "gathering_docs",
  "docs_ready",
]);
const STATUS_FILTERS = new Set(["all", "open", "converted"]);
const SEGMENT_FILTERS = new Set(["all", "seafarer", "sme"]);

/**
 * Param-driven agent leads queue → `{ rows, totalCount, kpi }`.
 * `/agent` page sends query params (search/stage/status/range/sort/page).
 */
export async function GET(request: Request) {
  try {
    const user = await requireModulePermission("leads", "view");
    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search") ?? "";

    const stageRaw = searchParams.get("stage") ?? "all";
    const stageFilter = STAGE_FILTERS.has(stageRaw) ? stageRaw : "all";

    // Default "all" — preserves open + converted (do not exclude converted).
    const statusRaw = searchParams.get("status") ?? "all";
    const statusFilter = STATUS_FILTERS.has(statusRaw) ? statusRaw : "all";

    const segmentRaw = searchParams.get("segment") ?? "all";
    const segmentFilter = (
      SEGMENT_FILTERS.has(segmentRaw) ? segmentRaw : "all"
    ) as "all" | "seafarer" | "sme";

    // Active queue defaults to All time (must not hide old-but-still-open leads).
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
    ) as AgentLeadsSortKey;
    const sortDirRaw = searchParams.get("sortDir") ?? "desc";
    const sortDir = sortDirRaw === "asc" ? "asc" : "desc";

    const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
    const pageSize = clampAgentLeadsQueuePageSize(
      Number(searchParams.get("pageSize") ?? 10),
    );

    const supabase = await createClient();
    const [queue, kpi] = await Promise.all([
      getAgentLeadsQueue(supabase, user.id, {
        search,
        stageFilter,
        statusFilter,
        segmentFilter,
        from,
        to,
        sortKey,
        sortDir,
        page,
        pageSize,
      }),
      getAgentLeadsQueueKpiCounts(supabase, user.id),
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
    const user = await requireModulePermission("leads", "create");
    const body = createLeadSchema.parse(await request.json());
    const supabase = await createClient();

    const { data: lead, error } = await supabase
      .from("leads")
      .insert({
        agent_user_id: user.id,
        borrower_name: body.borrowerName,
        business_name: body.businessName ?? null,
        borrower_id: body.borrowerId ?? null,
        application_id: body.applicationId ?? null,
        status: "open",
      })
      .select(
        "id, borrower_name, business_name, borrower_id, application_id, status, created_at",
      )
      .single();

    if (error || !lead) {
      throw new Error(error?.message ?? "Failed to create lead");
    }

    // If agent linked an existing borrower and no app was provided, attach
    // their latest application when visible (name search never returns app data).
    if (body.borrowerId && !body.applicationId && !lead.application_id) {
      const { data: app } = await supabase
        .from("loan_applications")
        .select("id")
        .eq("borrower_id", body.borrowerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (app?.id) {
        await supabase
          .from("leads")
          .update({ application_id: app.id })
          .eq("id", lead.id);
        lead.application_id = app.id;
      }
    }

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "leads",
      action: "create",
      entityType: "lead",
      entityId: lead.id,
      afterData: {
        borrowerName: body.borrowerName,
        businessName: body.businessName ?? null,
        borrowerId: lead.borrower_id,
        applicationId: lead.application_id,
      },
    });

    return jsonOk(
      {
        lead: {
          id: lead.id,
          borrowerName: lead.borrower_name,
          businessName: lead.business_name,
          borrowerId: lead.borrower_id,
          applicationId: lead.application_id,
          status: lead.status,
          createdAt: lead.created_at,
          checklistRequired: 0,
          checklistComplete: 0,
          checklistPercent: null,
        },
      },
      201,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
