import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  addPaymentToDcr,
  createDcrDraft,
  submitDcr,
} from "@/lib/ar/posting";
import {
  ForbiddenError,
  hasModulePermission,
  requireAuth,
} from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

const createSchema = z.object({ action: z.literal("create") });

const addItemSchema = z.object({
  action: z.literal("add_item"),
  dcrId: z.string().uuid(),
  paymentId: z.string().uuid(),
  allocations: z
    .array(
      z.object({
        amortizationScheduleId: z.string().uuid().nullable(),
        amount: z.number().positive(),
      }),
    )
    .optional(),
});

const submitSchema = z.object({
  action: z.literal("submit"),
  dcrId: z.string().uuid(),
});

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    const isCollector = await hasModulePermission("collection", "view", user.id);
    const isRemedial = await hasModulePermission("remedial", "view", user.id);
    if (!isCollector && !isRemedial) {
      throw new ForbiddenError(
        "Missing 'view' permission on module 'collection' or 'remedial'",
      );
    }

    const supabase = await createClient();
    const limitRaw = Number(
      new URL(request.url).searchParams.get("limit") ?? "50",
    );
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 200)
      : 50;

    // collector_user_id is the DCR owner id for both collector and remedial actors
    const { data, error } = await supabase
      .from("dcr")
      .select("*, dcr_items (*)")
      .eq("collector_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);

    // Rejected DCRs have their `dcr_items` deleted (frees the payment for
    // re-batching) — the display data lives in `rejected_items` instead.
    const dcrs = (data ?? []).map((row) => ({
      ...row,
      dcr_items:
        row.status === "rejected"
          ? ((row.rejected_items as unknown[]) ?? [])
          : row.dcr_items,
    }));

    return jsonOk({ dcrs });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const isCollector = await hasModulePermission("collection", "edit", user.id);
    const isRemedial = await hasModulePermission("remedial", "edit", user.id);
    if (!isCollector && !isRemedial) {
      throw new ForbiddenError(
        "Missing 'edit' permission on module 'collection' or 'remedial'",
      );
    }

    const body = await request.json();
    const supabase = await createClient();

    if (createSchema.safeParse(body).success) {
      const result = await createDcrDraft(supabase, user.id);
      return jsonOk(result);
    }

    const addParsed = addItemSchema.safeParse(body);
    if (addParsed.success) {
      await addPaymentToDcr(
        supabase,
        addParsed.data.dcrId,
        addParsed.data.paymentId,
        user.id,
        addParsed.data.allocations,
      );
      return jsonOk({ added: true });
    }

    const submitParsed = submitSchema.safeParse(body);
    if (submitParsed.success) {
      const result = await submitDcr(
        supabase,
        submitParsed.data.dcrId,
        user.id,
      );

      await writeAuditEvent({
        actorId: user.id,
        moduleSlug: isCollector ? "collection" : "remedial",
        action: "execute_trigger",
        entityType: "dcr",
        entityId: submitParsed.data.dcrId,
        afterData: { trigger: "submit_dcr", ...result },
      });

      return jsonOk(result);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return handleApiError(error);
  }
}
