import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  assignMasterlist,
  assignRemedial,
  markPaidOff,
} from "@/lib/ar/masterlist";
import { PaidOffEligibilityError } from "@/lib/ar/paid-off";
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

const paidOffSchema = z.object({
  action: z.literal("mark_paid_off"),
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

    let applicationStatus: string | null = null;
    if (data.loan_application_id) {
      const { data: app } = await supabase
        .from("loan_applications")
        .select("status")
        .eq("id", data.loan_application_id)
        .maybeSingle();
      applicationStatus = (app?.status as string) ?? null;
    }

    const { data: payments } = await supabase
      .from("payments")
      .select("*")
      .eq("masterlist_id", id)
      .order("created_at", { ascending: false });

    return jsonOk({
      record: { ...data, application_status: applicationStatus },
      payments: payments ?? [],
    });
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
      // Stamp the start of the 3-day clearing window on the transition into
      // 'clearing'; reset it when the status goes back to 'pending'.
      let clearingStartedAt: string | null | undefined;
      if (body.checkClearingStatus) {
        const { data: current } = await supabase
          .from("masterlist")
          .select("check_clearing_status, clearing_started_at")
          .eq("id", id)
          .single();

        if (
          body.checkClearingStatus === "clearing" &&
          current?.check_clearing_status !== "clearing"
        ) {
          clearingStartedAt = new Date().toISOString();
        } else if (body.checkClearingStatus === "pending") {
          clearingStartedAt = null;
        }
      }

      const { error: statusError } = await supabase
        .from("masterlist")
        .update({
          ...(body.checkTransmittalStatus
            ? { check_transmittal_status: body.checkTransmittalStatus }
            : {}),
          ...(body.checkClearingStatus
            ? { check_clearing_status: body.checkClearingStatus }
            : {}),
          ...(clearingStartedAt !== undefined
            ? { clearing_started_at: clearingStartedAt }
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
    const raw = await request.json();
    const supabase = await createClient();

    if (
      raw &&
      typeof raw === "object" &&
      "action" in raw &&
      (raw as { action?: string }).action === "mark_paid_off"
    ) {
      paidOffSchema.parse(raw);
      const result = await markPaidOff(supabase, id, user.id);

      await writeAuditEvent({
        actorId: user.id,
        moduleSlug: "accounting_ar",
        action: "execute_trigger",
        entityType: "masterlist",
        entityId: id,
        afterData: {
          trigger: "mark_paid_off",
          applicationId: result.applicationId,
          status: result.status,
        },
      });

      return jsonOk({ paidOff: true, ...result });
    }

    const body = remedialSchema.parse(raw);
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
    if (error instanceof PaidOffEligibilityError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
