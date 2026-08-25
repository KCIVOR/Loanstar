import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { assertCsaCanEdit } from "@/lib/csa/application";
import {
  getActiveComputation,
  persistComputation,
} from "@/lib/csa/computation";
import {
  findCrossBucketAccountNos,
  findDuplicateAccountNos,
} from "@/lib/computation/deduction-breakdown";
import { assertInterviewRecordedForComputation } from "@/lib/csa/initial-interview";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const computeSchema = z.object({
  inputMode: z.enum(["NET_SARADO", "NET_LESS_SECURITY", "PRINCIPAL"]),
  amount: z.number().positive(),
  terms: z.number().int().min(1),
  /** SF requires ≥1 (G1); SME allows 0 (workbook default). */
  addonMonths: z.number().int().min(0).optional(),
  loanTypeId: z.string().uuid().optional(),
  securityFeeRate: z.number().min(0).optional(),
  /** SME/Individual only — free-text rate, overrides the loan-type lookup. Ignored for Seafarer. */
  pfRate: z.number().min(0).optional(),
  /** SME/Individual only — free-text rate, overrides the loan-type lookup. Ignored for Seafarer. */
  interestRate: z.number().min(0).optional(),
  /** SME/Individual: loan_desired × admin_rate (outside PF bundle). Ignored for Seafarer. */
  adminRate: z.number().min(0).optional(),
  /** SME/Individual: principal × chattel_rate (CMF). Ignored for Seafarer. */
  chattelRate: z.number().min(0).optional(),
  /** SME/Individual: With DS & Notary flag. Default true when omitted. */
  withDsAndNotary: z.boolean().optional(),
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
  releaseDate: z.string().optional(),
  dueDay: z.number().int().min(1).max(28).optional(),
});

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireModulePermission("computation", "view");
    const { id } = await params;
    const supabase = await createClient();
    const computation = await getActiveComputation(supabase, id);

    const { data: appRow } = await supabase
      .from("loan_applications")
      .select("borrower_id")
      .eq("id", id)
      .maybeSingle();

    let activeLoans: Array<{
      loanApplicationId: string;
      loanAccountNo: string;
      outstandingBalance: number;
      monthlyAmortization: number;
      accountStatus: string;
      remainingInstallments: number;
    }> = [];

    if (appRow?.borrower_id) {
      // masterlist RLS only grants SELECT to super_admin, accounting_ar, the
      // borrower, or the assigned collector — CSA/Committee have none of
      // those, so this must read via service role or it silently sees zero
      // rows (permission is already gated above by requireModulePermission).
      const admin = createServiceClient();
      const { data: masterlistRows } = await admin
        .from("masterlist")
        .select(
          "id, loan_application_id, loan_account_no, outstanding_balance, monthly_amortization, account_status",
        )
        .eq("borrower_id", appRow.borrower_id)
        .eq("account_status", "active");

      // One batched query for every active account's open-installment count
      // (not N+1) — the same set AR actually allocates against when an
      // Offset transfer posts, so "N months" in the offset picker matches
      // reality instead of an outstanding_balance ÷ monthly approximation.
      const masterlistIds = (masterlistRows ?? []).map((row) => row.id as string);
      const remainingByMasterlistId = new Map<string, number>();
      if (masterlistIds.length > 0) {
        const { data: scheduleRows } = await admin
          .from("amortization_schedules")
          .select("masterlist_id")
          .in("masterlist_id", masterlistIds)
          .in("status", ["pending", "partial", "overdue"]);
        for (const row of scheduleRows ?? []) {
          const mid = row.masterlist_id as string;
          remainingByMasterlistId.set(mid, (remainingByMasterlistId.get(mid) ?? 0) + 1);
        }
      }

      activeLoans = (masterlistRows ?? []).map((row) => ({
        loanApplicationId: (row.loan_application_id as string | null) ?? "",
        loanAccountNo: (row.loan_account_no as string | null) ?? "Active Account",
        outstandingBalance: Number(row.outstanding_balance ?? 0),
        monthlyAmortization: Number(row.monthly_amortization ?? 0),
        accountStatus: (row.account_status as string | null) ?? "active",
        remainingInstallments: remainingByMasterlistId.get(row.id as string) ?? 0,
      }));
    }

    return jsonOk({ computation, activeLoans });
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
    const individualLoanType =
      application.individual_loan_type === "mpl" ||
      application.individual_loan_type === "salary"
        ? application.individual_loan_type
        : null;
    const securityFeeRate =
      segment === "sme" || segment === "individual"
        ? 0
        : (body.securityFeeRate ?? Number(loanType.interest_rate));

    const saved = await persistComputation(supabase, {
      loanApplicationId: id,
      segment,
      individualLoanType,
      loanTypeId: loanType.id,
      loanTypeName: loanType.name,
      inputMode: body.inputMode,
      amount: body.amount,
      terms: body.terms,
      addonMonths: body.addonMonths,
      // SME/Individual: a typed rate overrides the loan-type lookup — loanType
      // is still resolved above unconditionally, but only for the label here.
      // Seafarer is untouched: always loanType's rate.
      pfRate:
        (segment === "sme" || segment === "individual") && body.pfRate != null
          ? body.pfRate
          : Number(loanType.pf_rate),
      interestRate:
        (segment === "sme" || segment === "individual") &&
        body.interestRate != null
          ? body.interestRate
          : Number(loanType.interest_rate),
      securityFeeRate,
      adminRate: body.adminRate,
      chattelRate: body.chattelRate,
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
