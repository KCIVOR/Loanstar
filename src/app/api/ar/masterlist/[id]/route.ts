import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { assignMasterlist, assignRemedial } from "@/lib/ar/masterlist";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const assignSchema = z.object({
  portfolioId: z.string().uuid().optional().nullable(),
  collectorUserId: z.string().uuid().optional().nullable(),
  checkTransmittalStatus: z
    .enum(["pending", "transmitted", "received"])
    .optional(),
  checkClearingStatus: z.enum(["pending", "clearing", "cleared"]).optional(),
});

const remedialSchema = z.object({
  remedialUserId: z.string().uuid(),
});

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireModulePermission("accounting_ar", "view");
    const { id } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("masterlist")
      .select(
        `
        *,
        portfolios ( id, name ),
        assignments ( * ),
        amortization_schedules ( * )
      `,
      )
      .eq("id", id)
      .single();

    if (error || !data) throw new Error("Masterlist record not found");

    const { data: payments } = await supabase
      .from("payments")
      .select("*")
      .eq("masterlist_id", id)
      .order("created_at", { ascending: false });

    return jsonOk({ record: data, payments: payments ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("accounting_ar", "edit");
    const { id } = await params;
    const body = assignSchema.parse(await request.json());
    const supabase = await createClient();

    if (body.portfolioId !== undefined || body.collectorUserId !== undefined) {
      await assignMasterlist(supabase, id, {
        portfolioId: body.portfolioId,
        collectorUserId: body.collectorUserId,
        assignedBy: user.id,
      });
    }

    if (body.checkTransmittalStatus || body.checkClearingStatus) {
      const { error: statusError } = await supabase
        .from("masterlist")
        .update({
          ...(body.checkTransmittalStatus
            ? { check_transmittal_status: body.checkTransmittalStatus }
            : {}),
          ...(body.checkClearingStatus
            ? { check_clearing_status: body.checkClearingStatus }
            : {}),
        })
        .eq("id", id);

      if (statusError) throw new Error(statusError.message);
    }

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "accounting_ar",
      action: "update",
      entityType: "masterlist",
      entityId: id,
      afterData: body,
    });

    return jsonOk({ assigned: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("accounting_ar", "execute_trigger");
    const { id } = await params;
    const body = remedialSchema.parse(await request.json());
    const supabase = await createClient();

    await assignRemedial(supabase, id, body.remedialUserId, user.id);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "accounting_ar",
      action: "execute_trigger",
      entityType: "masterlist",
      entityId: id,
      afterData: { trigger: "remedial_turnover", ...body },
    });

    return jsonOk({ turnedOver: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
