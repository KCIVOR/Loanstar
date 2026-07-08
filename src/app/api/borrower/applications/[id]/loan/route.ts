import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { DOCUMENT_BUCKET } from "@/lib/constants";
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
});

async function getBorrowerMasterlist(userId: string, applicationId: string) {
  const supabase = await createClient();
  const { data: app } = await supabase
    .from("loan_applications")
    .select("id, borrower_id, borrowers!inner ( user_id )")
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
    .select("id")
    .eq("loan_application_id", applicationId)
    .maybeSingle();

  if (!masterlist) {
    throw new ForbiddenError("Loan is not yet active");
  }

  return {
    masterlistId: masterlist.id as string,
    borrowerId: app.borrower_id as string,
    applicationId: app.id as string,
  };
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireModulePermission("borrower_portal", "view");
    const { id } = await ctx.params;
    const supabase = await createClient();
    await getBorrowerMasterlist(user.id, id);

    const { data: masterlist } = await supabase
      .from("masterlist")
      .select(
        `
        *,
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

    return jsonOk({ loan: masterlist, payments: payments ?? [] });
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
