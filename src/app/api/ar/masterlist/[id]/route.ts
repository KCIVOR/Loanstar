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
import { AMORTIZATION_SCHEDULE_LEDGER_COLUMNS } from "@/lib/ledger/build-account-ledger-rows";
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

async function fetchPdcChecks(scope: {
  releaseFileId: string | null;
  loanApplicationId: string | null;
}) {
  const admin = createServiceClient();
  let releaseFileId = scope.releaseFileId;
  if (!releaseFileId && scope.loanApplicationId) {
    const { data: releaseFile } = await admin
      .from("release_files")
      .select("id")
      .eq("loan_application_id", scope.loanApplicationId)
      .maybeSingle();
    releaseFileId = (releaseFile?.id as string | null) ?? null;
  }
  if (!releaseFileId) return [];

  const { data } = await admin
    .from("pdc_checks")
    .select("sort_order, check_number, status")
    .eq("release_file_id", releaseFileId)
    .order("sort_order", { ascending: true });
  return data ?? [];
}

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
        amortization_schedules ( ${AMORTIZATION_SCHEDULE_LEDGER_COLUMNS} )
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

    const uploaderIds = Array.from(
      new Set(
        (payments ?? [])
          .map((payment) => payment.uploaded_by as string | null)
          .filter((uploaderId): uploaderId is string => Boolean(uploaderId)),
      ),
    );
    const uploaderNameById = new Map<string, string>();
    if (uploaderIds.length > 0) {
      const admin = createServiceClient();
      const { data: uploaderProfiles } = await admin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", uploaderIds);
      for (const profile of uploaderProfiles ?? []) {
        uploaderNameById.set(
          profile.id as string,
          (profile.full_name as string) || (profile.email as string),
        );
      }
    }
    const paymentsWithUploaderNames = (payments ?? []).map((payment) => ({
      ...payment,
      uploadedByName: payment.uploaded_by
        ? (uploaderNameById.get(payment.uploaded_by as string) ?? null)
        : null,
    }));

    const { data: postings } = await supabase
      .from("postings")
      .select(
        "id, amortization_schedule_id, amount, penalty_amount, payments ( payment_date, reference_no, channel, status, move_of_payment_batch_id )",
      )
      .eq("masterlist_id", id)
      .order("posted_at", { ascending: true });

    // AR has no RLS grant on pdc_checks, so scope a service-role read to this
    // account's own release file to surface LRA-encoded check numbers.
    const pdcChecks = await fetchPdcChecks({
      releaseFileId: (data.release_file_id as string | null) ?? null,
      loanApplicationId: (data.loan_application_id as string | null) ?? null,
    });

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

    const { data: transferAllocRows } = await supabase
      .from("internal_transfer_allocations")
      .select(
        `
        id, amount, amortization_schedule_id, created_at,
        internal_transfers!inner (
          target_masterlist_id,
          source_masterlist:masterlist!internal_transfers_source_masterlist_id_fkey ( loan_account_no )
        )
      `,
      )
      .eq("internal_transfers.target_masterlist_id", id)
      .order("created_at", { ascending: false });

    const internalTransferCredits = (transferAllocRows ?? []).map((row) => {
      const transfer = Array.isArray(row.internal_transfers)
        ? row.internal_transfers[0]
        : row.internal_transfers;
      const sourceMl = Array.isArray(transfer?.source_masterlist)
        ? transfer.source_masterlist[0]
        : transfer?.source_masterlist;
      return {
        id: row.id as string,
        amount: Number(row.amount),
        amortization_schedule_id: row.amortization_schedule_id as string | null,
        createdAt: row.created_at as string,
        sourceLoanAccountNo: (sourceMl?.loan_account_no as string | null) ?? null,
      };
    });

    return jsonOk({
      record: { ...data, application_status: applicationStatus },
      payments: paymentsWithUploaderNames,
      postings: postings ?? [],
      pdcChecks,
      roundingWriteoffThreshold,
      roundingWriteoffs,
      internalTransferCredits,
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
        const admin = createServiceClient();
        const { data: configRow, error: configError } = await admin
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
