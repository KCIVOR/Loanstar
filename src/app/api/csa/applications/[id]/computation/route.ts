import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { assertCsaCanEdit } from "@/lib/csa/application";
import {
  getActiveComputation,
  persistComputation,
} from "@/lib/csa/computation";
import { assertInterviewRecordedForComputation } from "@/lib/csa/initial-interview";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const computeSchema = z.object({
  inputMode: z.enum(["NET_SARADO", "NET_LESS_SECURITY", "PRINCIPAL"]),
  amount: z.number().positive(),
  terms: z.number().int().min(1),
  /** SF requires ≥1 (G1); SME allows 0 (workbook default). */
  addonMonths: z.number().int().min(0).optional(),
  loanTypeId: z.string().uuid().optional(),
  securityFeeRate: z.number().min(0).optional(),
  /** SME: loan_desired × admin_rate (outside PF bundle). Ignored for Seafarer. */
  adminRate: z.number().min(0).optional(),
  /** SME: With DS & Notary flag. Default true when omitted. */
  withDsAndNotary: z.boolean().optional(),
  otherDeductions: z
    .object({
      otherLoan: z.number().min(0).optional(),
      offset: z.number().min(0).optional(),
      advancePayment: z.number().min(0).optional(),
      previousLoanBalance: z.number().min(0).optional(),
      accountOpening: z.number().min(0).optional(),
    })
    .optional(),
  releaseDate: z.string().optional(),
  dueDay: z.number().int().min(1).max(28).optional(),
});

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireModulePermission("computation", "view");
    const { id } = await params;
    const supabase = await createClient();
    const computation = await getActiveComputation(supabase, id);
    return jsonOk({ computation });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("computation", "create");
    const { id } = await params;
    const body = computeSchema.parse(await request.json());
    const supabase = await createClient();
    const application = await assertCsaCanEdit(supabase, id);

    try {
      assertInterviewRecordedForComputation(
        (application.initial_interview_at as string | null) ?? null,
      );
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "Initial interview must be recorded before preparing the loan computation",
        },
        { status: 400 },
      );
    }

    let loanType: {
      id: string;
      name: string;
      pf_rate: number;
      interest_rate: number;
    } | null = null;

    if (body.loanTypeId) {
      const { data, error } = await supabase
        .from("loan_types")
        .select("id, name, pf_rate, interest_rate")
        .eq("id", body.loanTypeId)
        .eq("is_active", true)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: "Invalid loan type" }, { status: 400 });
      }
      loanType = data;
    } else {
      const { data: details } = await supabase
        .from("application_details")
        .select("loan_type_id")
        .eq("loan_application_id", id)
        .maybeSingle();

      if (details?.loan_type_id) {
        const { data } = await supabase
          .from("loan_types")
          .select("id, name, pf_rate, interest_rate")
          .eq("id", details.loan_type_id)
          .single();
        loanType = data;
      }
    }

    if (!loanType) {
      return NextResponse.json(
        { error: "Select an active loan type before computing" },
        { status: 400 },
      );
    }

    const borrowerRaw = application.borrowers;
    const borrower = Array.isArray(borrowerRaw)
      ? borrowerRaw[0]
      : borrowerRaw;
    const financial = (borrower?.financial ?? {}) as {
      monthlyIncome?: number;
      monthlyIncomePhp?: number;
    };
    // Profile form stores PHP as monthlyIncomePhp; legacy rows may use monthlyIncome.
    const monthlyIncome =
      financial.monthlyIncomePhp ?? financial.monthlyIncome ?? null;
    const segment =
      application.segment === "sme" || application.segment === "individual"
        ? application.segment
        : "seafarer";
    const securityFeeRate =
      segment === "sme" || segment === "individual"
        ? 0
        : (body.securityFeeRate ?? Number(loanType.interest_rate));

    const saved = await persistComputation(supabase, {
      loanApplicationId: id,
      segment,
      loanTypeId: loanType.id,
      loanTypeName: loanType.name,
      inputMode: body.inputMode,
      amount: body.amount,
      terms: body.terms,
      addonMonths: body.addonMonths,
      pfRate: Number(loanType.pf_rate),
      interestRate: Number(loanType.interest_rate),
      securityFeeRate,
      adminRate: body.adminRate,
      withDsAndNotary: body.withDsAndNotary,
      otherDeductions: body.otherDeductions,
      releaseDate: body.releaseDate,
      dueDay: body.dueDay,
      monthlyIncome,
      computedBy: user.id,
    });

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "computation",
      action: "create",
      entityType: "computation",
      entityId: saved.computation.id,
      afterData: {
        applicationId: id,
        principal: saved.computation.principal,
        netReleased: saved.computation.netReleased,
      },
    });

    return jsonOk({
      computation: saved.computation,
      coverage: saved.coverage,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
