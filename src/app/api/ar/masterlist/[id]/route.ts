import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  assignMasterlist,
  assignRemedial,
  markPaidOff,
} from "@/lib/ar/masterlist";
import { getRoundingWriteoffThreshold } from "@/lib/ar/posting";
import { PaidOffEligibilityError } from "@/lib/ar/paid-off";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const assignSchema = z.object({
  portfolioId: z.string().uuid().optional().nullable(),
  collectorUserId: z.string().uuid().optional().nullable(),
  birStatusCode: z.string().nullable().optional(),
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

    const { data: postings } = await supabase
      .from("postings")
      .select("id, amortization_schedule_id, amount, payments ( payment_date )")
      .eq("masterlist_id", id)
      .not("amortization_schedule_id", "is", null)
      .order("posted_at", { ascending: true });

    const roundingWriteoffThreshold =
      await getRoundingWriteoffThreshold(supabase);

    const { data: writeoffRows } = await supabase
      .from("rounding_writeoffs")
      .select(
        "id, amount, amortization_schedule_id, performed_at, notes, performed_by",
      )
      .eq("masterlist_id", id)
      .order("performed_at", { ascending: false });

    const scheduleIds = Array.from(
      new Set(
        (writeoffRows ?? [])
          .map((row) => row.amortization_schedule_id as string | null)
          .filter((sid): sid is string => Boolean(sid)),
      ),
    );
    const installmentByScheduleId = new Map<string, number>();
    if (scheduleIds.length > 0) {
      const { data: scheduleRows } = await supabase
        .from("amortization_schedules")
        .select("id, installment_no")
        .in("id", scheduleIds);
      for (const row of scheduleRows ?? []) {
        installmentByScheduleId.set(
          row.id as string,
          row.installment_no as number,
        );
      }
    }

    const performerIds = Array.from(
      new Set(
        (writeoffRows ?? [])
          .map((row) => row.performed_by as string)
          .filter(Boolean),
      ),
    );
    const nameById = new Map<string, string>();
    if (performerIds.length > 0) {
      const admin = createServiceClient();
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", performerIds);
      for (const p of profiles ?? []) {
        nameById.set(
          p.id as string,
          (p.full_name as string) || (p.email as string),
        );
      }
    }

    const roundingWriteoffs = (writeoffRows ?? []).map((row) => {
      const scheduleId = row.amortization_schedule_id as string | null;
      return {
        id: row.id as string,
        amount: Number(row.amount),
        amortization_schedule_id: scheduleId,
        performed_at: row.performed_at as string,
        notes: (row.notes as string | null) ?? null,
        performedByName: nameById.get(row.performed_by as string) ?? null,
        installmentNo: scheduleId
          ? (installmentByScheduleId.get(scheduleId) ?? null)
          : null,
      };
    });

    return jsonOk({
      record: { ...data, application_status: applicationStatus },
      payments: payments ?? [],
      postings: postings ?? [],
      roundingWriteoffThreshold,
      roundingWriteoffs,
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

    if (body.birStatusCode !== undefined) {
      if (body.birStatusCode !== null) {
        const { data: configRow, error: configError } = await supabase
          .from("config_settings")
          .select("value")
          .eq("key", "bir_status_codes")
          .maybeSingle();
        if (configError) throw new Error(configError.message);
        const map =
          configRow?.value &&
          typeof configRow.value === "object" &&
          !Array.isArray(configRow.value)
            ? (configRow.value as Record<string, string>)
            : {};
        if (!(body.birStatusCode in map)) {
          return NextResponse.json(
            { error: "Unrecognized classification code" },
            { status: 400 },
          );
        }
      }

      const { error: birError } = await supabase
        .from("masterlist")
        .update({ bir_status_code: body.birStatusCode })
        .eq("id", id);
      if (birError) throw new Error(birError.message);
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
