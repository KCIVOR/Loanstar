import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { assertCsaCanEdit } from "@/lib/csa/application";
import {
  getActiveComputation,
  persistComputation,
  validateCollateralPaymentSchedule,
  validateFrequencyTerms,
  validateOriginationDiscounts,
  validateSeafarerDueDay,
} from "@/lib/csa/computation";
import {
  findCrossBucketAccountNos,
  findDuplicateAccountNos,
} from "@/lib/computation/deduction-breakdown";
import { assertInterviewRecordedForComputation } from "@/lib/csa/initial-interview";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { formatDateLocal } from "@/lib/computation/release-date";
import { halfUp } from "@/lib/computation/money";

type RouteParams = { params: Promise<{ id: string }> };

const computeSchema = z.object({
  inputMode: z.enum(["NET_SARADO", "NET_LESS_SECURITY", "PRINCIPAL"]),
  amount: z.number().positive(),
  terms: z.number().int().min(1),
  /** All segments allow 0 (workbook default). */
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
            // Early-settlement discount breakdown (Phase 5) — optional,
            // present only when a discount was applied in the modal.
            discountAmount: z.number().min(0).optional(),
            discountedInstallmentNos: z.array(z.number().int().positive()).optional(),
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
        ctx.addIssue(`Duplicate account "${dup}" in Offset entries`);
      }
      for (const dup of findDuplicateAccountNos(val.offsets)) {
        ctx.addIssue(`Duplicate account "${dup}" in Other Loan entries`);
      }
      for (const dup of findCrossBucketAccountNos(val.otherLoans, val.offsets)) {
        ctx.addIssue(
          `Account "${dup}" cannot be targeted by both Offset and Other Loan in the same computation`,
        );
      }
    })
    .optional(),
  releaseDate: z.string().optional(),
  dueDay: z.number().int().min(1).max(28).optional(),
  originationDiscounts: z
    .array(
      z.object({
        installmentNo: z.number().int().positive(),
        percent: z.number().min(0).max(100),
      }),
    )
    .optional(),
  /** Daily Interest only — CSA-entered manual payment date. Required when
   * the resolved schedule type is "daily"; ignored otherwise. */
  paymentDate: z.string().optional(),
  /** SME or Individual — overrides the application's own intake-level
   * payment_schedule for this computation. Omitted → defaults to the
   * application's value (unchanged behavior). CSA and Committee both may
   * set this. Ignored for Seafarer. */
  paymentSchedule: z
    .enum([
      "mpl",
      "salary",
      "monthly",
      "weekly",
      "bi_monthly",
      "quarterly",
      "two_monthly",
      "daily",
      "quarterly_special",
      "two_monthly_special",
    ])
    .optional(),
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
      /** Not-yet-due installments only (Rule 2 — due/passed months are never
       * discount-eligible, so they're excluded here rather than merely
       * flagged). Feeds the Offset early-settlement discount picker; see
       * docs/revision-plans/feature-early-settlement-discount.md. */
      futureInstallments: Array<{
        installmentNo: number;
        dueDate: string;
        interestPortion: number;
      }>;
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
          "id, loan_application_id, loan_account_no, outstanding_balance, monthly_amortization, account_status, computation_id",
        )
        .eq("borrower_id", appRow.borrower_id)
        .eq("account_status", "active");

      // One batched query for every active account's open-installment count
      // (not N+1) — the same set AR actually allocates against when an
      // Offset transfer posts, so "N months" in the offset picker matches
      // reality instead of an outstanding_balance ÷ monthly approximation.
      // Also the source for futureInstallments below — one fetch serves both.
      const masterlistIds = (masterlistRows ?? []).map((row) => row.id as string);
      const remainingByMasterlistId = new Map<string, number>();
      const futureRowsByMasterlistId = new Map<
        string,
        Array<{ installmentNo: number; dueDate: string }>
      >();
      const today = formatDateLocal(new Date());
      if (masterlistIds.length > 0) {
        const { data: scheduleRows } = await admin
          .from("amortization_schedules")
          .select("masterlist_id, installment_no, due_date, status, amount_due")
          .in("masterlist_id", masterlistIds)
          .in("status", ["pending", "partial", "overdue"]);
        for (const row of scheduleRows ?? []) {
          // Quarterly/Two-Monthly Special loans persist a $0 "principal"
          // placeholder row alongside every non-final period's real interest
          // row — excluded here so "N months remaining" isn't roughly
          // doubled and the offset picker never offers a non-real row.
          if (Number(row.amount_due) <= 0) continue;
          const mid = row.masterlist_id as string;
          remainingByMasterlistId.set(mid, (remainingByMasterlistId.get(mid) ?? 0) + 1);
          const dueDate = row.due_date as string;
          // Rule 2: only future, not-yet-due installments are eligible —
          // excluded entirely here, not just flagged, so the modal (Phase 5)
          // can never render an ineligible option in the first place.
          if (dueDate > today) {
            const list = futureRowsByMasterlistId.get(mid) ?? [];
            list.push({ installmentNo: row.installment_no as number, dueDate });
            futureRowsByMasterlistId.set(mid, list);
          }
        }
      }

      // Interest portion per installment isn't stored anywhere (amount_due is
      // principal+interest blended) — derive it from each loan's own active
      // computation, same even-split convention (totalInterest ÷ terms) used
      // for origination discounts (Phase 2) and the existing "Add-on
      // interest" display in ComputationPanel.tsx. Semi-monthly rows are half
      // a calendar month each, so their interest is halved too — same
      // reasoning as Phase 2's isSemiMonthly handling.
      const computationIds = Array.from(
        new Set(
          (masterlistRows ?? [])
            .map((row) => row.computation_id as string | null)
            .filter((id): id is string => Boolean(id)),
        ),
      );
      const interestPerRowByComputationId = new Map<string, number>();
      if (computationIds.length > 0) {
        const { data: computationRows } = await admin
          .from("computations")
          .select("id, total_interest, terms, payment_frequency")
          .in("id", computationIds);
        for (const row of computationRows ?? []) {
          const terms = Number(row.terms) || 1;
          const interestPerMonth = halfUp(Number(row.total_interest) / terms);
          const isSemiMonthly = row.payment_frequency === "semi_monthly";
          interestPerRowByComputationId.set(
            row.id as string,
            isSemiMonthly ? halfUp(interestPerMonth / 2) : interestPerMonth,
          );
        }
      }

      activeLoans = (masterlistRows ?? []).map((row) => {
        const mid = row.id as string;
        const interestPortion =
          interestPerRowByComputationId.get(row.computation_id as string) ?? 0;
        return {
          loanApplicationId: (row.loan_application_id as string | null) ?? "",
          loanAccountNo: (row.loan_account_no as string | null) ?? "Active Account",
          outstandingBalance: Number(row.outstanding_balance ?? 0),
          monthlyAmortization: Number(row.monthly_amortization ?? 0),
          accountStatus: (row.account_status as string | null) ?? "active",
          remainingInstallments: remainingByMasterlistId.get(mid) ?? 0,
          futureInstallments: (futureRowsByMasterlistId.get(mid) ?? [])
            .sort((a, b) => a.installmentNo - b.installmentNo)
            .map((inst) => ({ ...inst, interestPortion })),
        };
      });
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
    const securityFeeRate =
      segment === "sme" || segment === "individual"
        ? 0
        : (body.securityFeeRate ?? Number(loanType.interest_rate));

    const dueDayError = validateSeafarerDueDay(segment, body.dueDay);
    if (dueDayError) {
      return NextResponse.json({ error: dueDayError }, { status: 400 });
    }

    // Unified schedule choice defaults to the application's own
    // intake-level value (loan_applications.payment_schedule) — CSA (and
    // Committee, via the override endpoint) may explicitly override it for
    // this computation, without rewriting what the application originally
    // requested. Valid for SME or Individual; ignored for Seafarer.
    const applicationPaymentSchedule =
      application.payment_schedule === "mpl" ||
      application.payment_schedule === "salary" ||
      application.payment_schedule === "weekly" ||
      application.payment_schedule === "bi_monthly" ||
      application.payment_schedule === "quarterly" ||
      application.payment_schedule === "two_monthly" ||
      application.payment_schedule === "daily" ||
      application.payment_schedule === "quarterly_special" ||
      application.payment_schedule === "two_monthly_special"
        ? application.payment_schedule
        : "monthly";
    const paymentSchedule = body.paymentSchedule ?? applicationPaymentSchedule;

    const collateralType =
      application.collateral_type === "car_refinancing" ||
      application.collateral_type === "real_estate"
        ? application.collateral_type
        : "none";
    const collateralScheduleError = validateCollateralPaymentSchedule(
      collateralType,
      paymentSchedule,
    );
    if (collateralScheduleError) {
      return NextResponse.json({ error: collateralScheduleError }, { status: 400 });
    }

    // validateOriginationDiscounts/validateFrequencyTerms operate on the
    // 7-value computations.payment_frequency vocabulary, not the 8-value
    // payment_schedule — translate the same way persistComputation does
    // ("mpl" behaves like "monthly", "salary" like "semi_monthly") so these
    // checks agree with what actually gets persisted.
    const derivedPaymentFrequency =
      paymentSchedule === "mpl"
        ? "monthly"
        : paymentSchedule === "salary"
          ? "semi_monthly"
          : paymentSchedule;

    const originationDiscountsError = validateOriginationDiscounts(
      body.terms,
      body.originationDiscounts,
      derivedPaymentFrequency,
    );
    if (originationDiscountsError) {
      return NextResponse.json({ error: originationDiscountsError }, { status: 400 });
    }

    const frequencyTermsError = validateFrequencyTerms(derivedPaymentFrequency, body.terms);
    if (frequencyTermsError) {
      return NextResponse.json({ error: frequencyTermsError }, { status: 400 });
    }

    if (paymentSchedule === "daily" && !body.paymentDate) {
      return NextResponse.json(
        { error: "Payment date is required for Daily Interest loans" },
        { status: 400 },
      );
    }

    const saved = await persistComputation(supabase, {
      loanApplicationId: id,
      segment,
      collateralType,
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
      paymentSchedule,
      originationDiscounts: body.originationDiscounts,
      manualPaymentDate: body.paymentDate,
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
