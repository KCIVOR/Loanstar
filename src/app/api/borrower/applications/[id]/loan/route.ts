import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { DOCUMENT_BUCKET } from "@/lib/constants";
import {
  assertPaymentProofPathOwnedByBorrower,
  isAllowedPaymentProofMime,
} from "@/lib/payments/proof-storage";
import {
  ForbiddenError,
  requireModulePermission,
} from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  referenceNo: z.string().optional(),
  paymentDate: z.string().min(1),
  amount: z.number().positive(),
  channel: z.enum(["bank_deposit", "check", "pos_cash"]),
  storagePath: z.string().optional(),
  fileName: z.string().optional(),
  mimeType: z.string().optional(),
  notes: z.string().trim().max(1000).optional(),
});

async function getBorrowerMasterlist(userId: string, applicationId: string) {
  const supabase = await createClient();
  const { data: app } = await supabase
    .from("loan_applications")
    .select("id, status, borrower_id, borrowers!inner ( user_id )")
    .eq("id", applicationId)
    .single();

  if (!app) throw new ForbiddenError("Application not found");

  const borrowerRaw = app.borrowers;
  const borrower = Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw;
  if (borrower?.user_id !== userId) {
    throw new ForbiddenError("Application not found");
  }

  const { data: masterlist } = await supabase
    .from("masterlist")
    .select("id, outstanding_balance")
    .eq("loan_application_id", applicationId)
    .maybeSingle();

  if (!masterlist) {
    throw new ForbiddenError("Loan is not yet active");
  }

  return {
    masterlistId: masterlist.id as string,
    borrowerId: app.borrower_id as string,
    applicationId: app.id as string,
    applicationStatus: String(app.status),
    outstandingBalance: Number(masterlist.outstanding_balance ?? 0),
  };
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireModulePermission("borrower_portal", "view");
    const { id } = await ctx.params;
    const supabase = await createClient();
    const ctxData = await getBorrowerMasterlist(user.id, id);

    const { data: masterlist } = await supabase
      .from("masterlist")
      .select(
        `
        id,
        loan_application_id,
        borrower_id,
        loan_account_no,
        borrower_no,
        borrower_name,
        loan_amount,
        principal,
        total_loan,
        net_released,
        monthly_amortization,
        terms,
        first_payment_date,
        release_date,
        loan_type_name,
        manning_agency,
        vessel_name,
        portfolio_id,
        coverage_ratio,
        atm_bank_name,
        atm_card_last4,
        atm_account_number,
        release_paths,
        outstanding_balance,
        aging_bucket,
        account_status,
        remedial_flag,
        segment,
        closed_at,
        created_at,
        updated_at,
        amortization_schedules ( * )
      `,
      )
      .eq("loan_application_id", id)
      .single();

    const { data: payments } = await supabase
      .from("payments")
      .select("*")
      .eq("loan_application_id", id)
      .order("created_at", { ascending: false });
    const borrowerSafePayments = (payments ?? []).map((payment) => {
      const { uploaded_by: uploadedBy, ...borrowerSafePayment } = payment;
      return {
        ...borrowerSafePayment,
        uploadedByStaff: Boolean(uploadedBy && uploadedBy !== user.id),
      };
    });

    const { data: postings } = await supabase
      .from("postings")
      .select(
        "id, amortization_schedule_id, amount, payments ( payment_date, reference_no, channel, status )",
      )
      .eq("masterlist_id", ctxData.masterlistId)
      .order("posted_at", { ascending: true });

    // Borrowers may read their own release file and its LRA-encoded checks.
    const { data: releaseFile } = await supabase
      .from("release_files")
      .select("id")
      .eq("loan_application_id", id)
      .maybeSingle();
    const { data: pdcChecks } = releaseFile
      ? await supabase
          .from("pdc_checks")
          .select("sort_order, check_number")
          .eq("release_file_id", releaseFile.id as string)
          .order("sort_order", { ascending: true })
      : { data: [] };

    return jsonOk({
      loan: masterlist,
      payments: borrowerSafePayments,
      postings: postings ?? [],
      pdcChecks: pdcChecks ?? [],
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireModulePermission("borrower_portal", "edit");
    const { id } = await ctx.params;
    const body = schema.parse(await request.json());
    const supabase = await createClient();
    const ctxData = await getBorrowerMasterlist(user.id, id);

    if (ctxData.applicationStatus === "paid_off" || ctxData.outstandingBalance <= 0) {
      return NextResponse.json(
        { error: "This loan is paid off — payment proofs are closed" },
        { status: 400 },
      );
    }

    if (body.storagePath || body.fileName) {
      if (!body.storagePath || !body.fileName) {
        return NextResponse.json(
          { error: "storagePath and fileName are required together" },
          { status: 400 },
        );
      }
      try {
        assertPaymentProofPathOwnedByBorrower(
          body.storagePath,
          ctxData.borrowerId,
        );
      } catch (pathError) {
        return NextResponse.json(
          {
            error:
              pathError instanceof Error
                ? pathError.message
                : "Invalid payment proof storage path",
          },
          { status: 400 },
        );
      }
      if (body.mimeType && !isAllowedPaymentProofMime(body.mimeType)) {
        return NextResponse.json(
          { error: "Unsupported file type for payment proof" },
          { status: 400 },
        );
      }
    }

    const { data, error } = await supabase
      .from("payments")
      .insert({
        masterlist_id: ctxData.masterlistId,
        loan_application_id: ctxData.applicationId,
        borrower_id: ctxData.borrowerId,
        reference_no: body.referenceNo ?? null,
        payment_date: body.paymentDate,
        amount: body.amount,
        channel: body.channel,
        storage_path: body.storagePath ?? null,
        file_name: body.fileName ?? null,
        notes: body.notes || null,
        status: "pending_verification",
        uploaded_by: user.id,
      })
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Failed to record payment");
    }

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "borrower_portal",
      action: "create",
      entityType: "payment",
      entityId: data.id,
      afterData: {
        applicationId: id,
        amount: body.amount,
        channel: body.channel,
        bucket: DOCUMENT_BUCKET,
      },
    });

    return jsonOk({ payment: data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
