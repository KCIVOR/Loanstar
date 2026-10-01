import { NextResponse } from "next/server";
import { z } from "zod";
import { formatZodError } from "@/lib/api/zod-error";

import { handleApiError, jsonOk } from "@/lib/api/handler";
import { writeAuditEvent } from "@/lib/audit/writer";
import { notifyBorrowerForApplication } from "@/lib/notifications/write";
import {
  canReviewAssignedPayment,
  getPaymentReviewContext,
} from "@/lib/notifications/workflow-recipients";
import {
  ForbiddenError,
  hasModulePermission,
  isSuperAdmin,
  requireAuth,
} from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const schema = z
  .object({
    status: z.enum(["confirmed", "rejected"]),
    note: z.string().trim().max(500).optional(),
  })
  .refine((b) => b.status !== "rejected" || !!b.note, {
    message: "A reason is required when rejecting a payment proof",
    path: ["note"],
  });

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const body = schema.parse(await request.json());
    const supabase = await createClient();

    const [canCollect, canRemedial, superAdmin] = await Promise.all([
      hasModulePermission("collection", "edit", user.id),
      hasModulePermission("remedial", "edit", user.id),
      isSuperAdmin(user.id),
    ]);
    if (!canCollect && !canRemedial && !superAdmin) {
      throw new ForbiddenError("Payment not found");
    }

    // Session client: payments_select (collection/remedial view) and
    // assignments_select (collector/remedial owner) let a reviewer read these.
    const context = await getPaymentReviewContext(supabase, id);
    if (
      !context ||
      !canReviewAssignedPayment(user.id, context.assignment, superAdmin)
    ) {
      // Same error for unassigned reviewer and nonexistent payment.
      throw new ForbiddenError("Payment not found");
    }

    const { data, error } = await supabase
      .from("payments")
      .update({
        status: body.status,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "pending_verification")
      .select("id, amount, reference_no, payment_date, channel")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }
    if (!data) {
      throw new Error("Payment is no longer pending review");
    }

    await writeAuditEvent({
      actorId: user.id,
      // Reviewer acting only through the remedial desk is logged under it.
      moduleSlug: !canCollect && canRemedial ? "remedial" : "collection",
      action: "update",
      entityType: "payment",
      entityId: id,
      applicationId: context.applicationId,
      beforeData: { status: "pending_verification" },
      afterData: {
        trigger:
          body.status === "confirmed"
            ? "payment_proof_confirmed"
            : "payment_proof_rejected",
        status: body.status,
        amount: data.amount,
        referenceNo: data.reference_no,
        paymentDate: data.payment_date,
        channel: data.channel,
        reason: body.note ?? null,
      },
    });

    await notifyBorrowerForApplication(context.applicationId, {
      title:
        body.status === "confirmed"
          ? "Payment proof confirmed"
          : "Payment proof needs attention",
      body:
        body.status === "confirmed"
          ? "Your submitted payment proof was confirmed and is awaiting posting to your loan account."
          : "Your submitted payment proof could not be verified. Please contact Loan Star for guidance.",
      link: `/borrower/applications/${context.applicationId}`,
      kind:
        body.status === "confirmed"
          ? "payment_proof_confirmed"
          : "payment_proof_rejected",
      entityType: "payment",
      entityId: id,
    });

    return jsonOk({ status: body.status });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: formatZodError(error) }, { status: 400 });
    }
    return handleApiError(error);
  }
}
