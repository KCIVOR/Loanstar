import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  findCrossBucketAccountNos,
  findDuplicateAccountNos,
} from "@/lib/computation/deduction-breakdown";
import {
  committeeAdjustPreDecision,
  committeeOverrideAmount,
} from "@/lib/negotiation/service";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const overrideSchema = z.object({
  amount: z.number().positive(),
  inputMode: z.enum(["NET_SARADO", "NET_LESS_SECURITY", "PRINCIPAL"]),
  terms: z.number().int().positive(),
  addonMonths: z.number().int().min(0).optional(),
  loanTypeId: z.string().uuid().optional(),
  /** SME/Individual only — free-text rate override. Ignored for Seafarer. */
  pfRate: z.number().min(0).optional(),
  interestRate: z.number().min(0).optional(),
  adminRate: z.number().min(0).optional(),
  chattelRate: z.number().min(0).optional(),
  withDsAndNotary: z.boolean().optional(),
  message: z.string().trim().max(2000).optional(),
  otherDeductions: z
    .object({
      otherLoan: z.number().min(0).optional(),
      otherLoanAccountNo: z.string().nullable().optional(),
      offset: z.number().min(0).optional(),
      offsetAccountNo: z.string().nullable().optional(),
      offsetMonths: z.number().min(0).optional(),
      otherLoans: z
        .array(
          z.object({
            accountNo: z.string().nullable(),
            amount: z.number().min(0),
          }),
        )
        .optional(),
      offsets: z
        .array(
          z.object({
            accountNo: z.string().nullable(),
            amount: z.number().min(0),
            months: z.number().min(0).nullable(),
          }),
        )
        .optional(),
      advancePayment: z.number().min(0).optional(),
      previousLoanBalance: z.number().min(0).optional(),
      accountOpening: z.number().min(0).optional(),
    })
    .superRefine((val, ctx) => {
      for (const dup of findDuplicateAccountNos(val.otherLoans)) {
        ctx.addIssue(`Duplicate account "${dup}" in Other Loan entries`);
      }
      for (const dup of findDuplicateAccountNos(val.offsets)) {
        ctx.addIssue(`Duplicate account "${dup}" in Offset entries`);
      }
      for (const dup of findCrossBucketAccountNos(val.otherLoans, val.offsets)) {
        ctx.addIssue(
          `Account "${dup}" cannot be targeted by both Other Loan and Offset in the same computation`,
        );
      }
    })
    .optional(),
});

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("committee", "edit");
    const { id } = await params;
    const body = overrideSchema.parse(await request.json());
    const supabase = await createClient();

    const { data: app } = await supabase
      .from("loan_applications")
      .select("status")
      .eq("id", id)
      .single();

    if (!app || !["for_approval", "negotiating_terms"].includes(app.status)) {
      return NextResponse.json(
        { error: "Override only available before or during negotiation" },
        { status: 400 },
      );
    }

    // Before the decision (for_approval): adjust the active computation only,
    // no status/negotiation change. During negotiation: the full override —
    // updates the negotiation record and moves status to awaiting_confirmation.
    const isPreDecision = app.status === "for_approval";
    const saved = isPreDecision
      ? await committeeAdjustPreDecision(supabase, id, user.id, body)
      : await committeeOverrideAmount(supabase, id, user.id, body, body.message);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "committee",
      action: "execute_trigger",
      entityType: "computation",
      entityId: saved.computation.id,
      afterData: {
        applicationId: id,
        trigger: isPreDecision
          ? "committee_adjust_pre_decision"
          : "committee_override",
        netReleased: saved.computation.netReleased,
      },
    });

    return jsonOk({ computation: saved.computation });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
