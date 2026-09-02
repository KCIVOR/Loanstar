import type { SupabaseClient } from "@supabase/supabase-js";

import { appendStatusHistory } from "@/lib/applications/status";
import type { BusinessInfo } from "@/lib/borrowers/business-info";
import { mapBorrowerRow } from "@/lib/borrowers/types";
import { getActiveComputation } from "@/lib/csa/computation";
import {
  canMarkPaidOff,
  PaidOffEligibilityError,
} from "@/lib/ar/paid-off";
import { generateAmortizationSchedule } from "@/lib/ar/schedule";
import type { AmortizationInstallment } from "@/lib/ar/schedule";
import { halfUp, netInstallmentDue } from "@/lib/computation/money";
import { computeInvoiceLoan } from "@/lib/computation/invoice";
import type { InvoiceComputeResult } from "@/lib/computation/invoice";
import { buildDiscountUnits } from "@/lib/computation/discount-units";

/**
 * Adapter: Invoice computation result → amortization schedule rows.
 * Invoice has weekly interest-only payments (installmentNo 1..N) plus one
 * final principal payment (installmentNo N+1). Exported — also used by
 * `lra/release-service.ts`'s `savePdcChecks` to build the same shape as the
 * expected PDC check schedule, so PDC and the real AR masterlist schedule
 * can never diverge (same source function, not two parallel implementations).
 */
export function invoiceScheduleToInstallments(
  result: InvoiceComputeResult,
): AmortizationInstallment[] {
  const installments: AmortizationInstallment[] = [];

  // Weekly interest payments (installmentNo 1..12/8/4 depending on terms)
  result.weeklySchedule.forEach((week) => {
    installments.push({
      installmentNo: week.weekNo,
      dueDate: week.dueDate,
      amountDue: week.amountDue,
    });
  });

  // Principal payment (installmentNo N+1, one week after final interest)
  installments.push({
    installmentNo: result.weeklySchedule.length + 1,
    dueDate: result.principalDueDate,
    amountDue: result.principalAmount,
  });

  return installments;
}

/**
 * Denormalized employment/identity columns on masterlist.
 * SME reuses manning_agency / vessel_name for company + nature (no schema change).
 * Individual has neither a business nor a manning agency/vessel — both columns
 * resolve to null (deliberate, not a silent gap: there is nothing to map,
 * per Phase 11.3's "decide and document" requirement).
 */
export function resolveMasterlistEmploymentFields(input: {
  segment: string | null | undefined;
  manningAgencyName?: string | null;
  vesselName?: string | null;
  businessInfo?: BusinessInfo | null;
}): { manningAgency: string | null; vesselName: string | null } {
  if (input.segment === "sme") {
    const biz = input.businessInfo ?? {};
    const company = (biz.companyName ?? "").trim() || null;
    const natureOrAddress =
      (biz.natureOfBusiness ?? "").trim() ||
      (biz.officeAddress ?? biz.companyAddress ?? "").trim() ||
      null;
    return { manningAgency: company, vesselName: natureOrAddress };
  }
  if (input.segment === "individual") {
    return { manningAgency: null, vesselName: null };
  }
  return {
    manningAgency: (input.manningAgencyName ?? "").trim() || null,
    vesselName: (input.vesselName ?? "").trim() || null,
  };
}

/**
 * A newly-created installment row's initial status. A row whose net due is
 * already ≤0 the moment the origination discount is fixed at release (a
 * 100%-discounted installment) is born already settled — no cash will ever
 * be posted against it, and no rounding write-off applies (both of those
 * are the only other two places a row ever becomes "paid"), so leaving it
 * "pending" means it never becomes "paid" and later matches the
 * discount-reversion rule's `status <> 'paid'` filter, resurrecting the
 * waived amount once its due date arrives (F1/F3, see
 * docs/ledger-balance-consistency-fix-implementation-plan.md Phase 2). A
 * row's net due can only ever reach ≤0 this way (fixed at creation) or via
 * cash posted later (handled separately by `postSingleDcrItem`) — there is
 * no third path, so this only needs to run once, at creation.
 */
export function initialScheduleRowStatus(input: {
  amountDue: number;
  discountAmount: number;
  releaseDate: string;
}): { status: "paid" | "pending"; paidAt: string | null } {
  const netDue = netInstallmentDue({
    amountDue: input.amountDue,
    discountAmount: input.discountAmount,
  });
  const settledByDiscount = netDue <= 0;
  return {
    status: settledByDiscount ? "paid" : "pending",
    paidAt: settledByDiscount ? input.releaseDate : null,
  };
}

// `masterlistEmploymentLabels` and `masterlistSecondaryIdentity` moved to
// `@/lib/ar/masterlist-display` — every caller is a Client Component, and this
// module transitively imports `next/headers` (server-only), which breaks the
// production build. Import them from there, never re-export them here.

export async function initializeArAccount(
  supabase: SupabaseClient,
  loanApplicationId: string,
  releaseFileId: string,
  actorId?: string,
) {
  const { data: existing } = await supabase
    .from("masterlist")
    .select("id")
    .eq("loan_application_id", loanApplicationId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("ar_queue")
      .update({
        processed_at: new Date().toISOString(),
        masterlist_id: existing.id,
      })
      .eq("loan_application_id", loanApplicationId)
      .is("processed_at", null);
    return { masterlistId: existing.id as string, created: false };
  }

  const { data: app } = await supabase
    .from("loan_applications")
    .select(
      `
      id,
      application_no,
      borrower_id,
      segment,
      borrowers (*)
    `,
    )
    .eq("id", loanApplicationId)
    .single();

  if (!app?.borrower_id) {
    throw new Error("Application not found");
  }

  // Phase 5.0: persist segment at insert — aging/penalty reads masterlist.segment.
  // Legacy apps with null segment default to seafarer (pre-Phase-1 rows).
  const segment =
    app.segment === "sme" || app.segment === "individual"
      ? app.segment
      : "seafarer";

  const { data: releaseFile } = await supabase
    .from("release_files")
    .select("*")
    .eq("id", releaseFileId)
    .single();

  const computation = await getActiveComputation(supabase, loanApplicationId);
  if (!computation) {
    throw new Error("Computation not found for AR initialization");
  }

  const borrowerRaw = app.borrowers;
  const borrowerRow = Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw;
  const borrower = borrowerRow ? mapBorrowerRow(borrowerRow) : null;

  const employment = resolveMasterlistEmploymentFields({
    segment,
    manningAgencyName: borrower?.manningAgency?.name ?? null,
    vesselName: borrower?.picWork?.vessel ?? null,
    businessInfo: borrower?.businessInfo ?? null,
  });

  const releaseDate =
    computation.releaseDate ?? new Date().toISOString().slice(0, 10);

  const { data: masterlist, error: mlError } = await supabase
    .from("masterlist")
    .insert({
      loan_application_id: loanApplicationId,
      borrower_id: app.borrower_id,
      release_file_id: releaseFileId,
      computation_id: computation.id,
      loan_account_no: app.application_no,
      borrower_no: borrower?.borrowerNo ?? "",
      borrower_name: borrower
        ? `${borrower.firstName} ${borrower.lastName}`.trim()
        : "Unknown",
      segment,
      loan_amount: computation.principal,
      principal: computation.principal,
      total_loan: computation.totalLoan,
      net_released: computation.netReleased,
      monthly_amortization: computation.monthlyAmortization,
      terms: computation.terms,
      first_payment_date: computation.firstPaymentDate,
      release_date: releaseDate,
      loan_type_name: computation.loanTypeName,
      manning_agency: employment.manningAgency,
      vessel_name: employment.vesselName,
      coverage_ratio: computation.coverageRatio,
      release_paths: releaseFile?.release_paths ?? [],
      atm_bank_name: releaseFile?.atm_bank_name ?? null,
      atm_card_last4: releaseFile?.atm_card_last4 ?? null,
      atm_account_number: releaseFile?.atm_account_number ?? null,
      outstanding_balance: computation.totalLoan,
      aging_bucket: "current",
      account_status: "active",
    })
    .select("id")
    .single();

  if (mlError || !masterlist) {
    throw new Error(mlError?.message ?? "Failed to create masterlist record");
  }

  // Gross (pre-discount) basis for building the real schedule — using the
  // NET totalLoan/totalInterest/monthlyAmortization here (as this used to)
  // silently diluted the discount evenly across every installment via the
  // blended payment amount, instead of concentrating it on the specific
  // installments CSA selected: an undiscounted row would show a payment
  // already-reduced by 1/terms of the WHOLE discount, on top of which the
  // selected rows' discount_amount got subtracted a second time. Principal
  // is never discounted, so gross total loan is just principal + gross
  // interest (confirmed 2026-08-31 on AN300434 — see
  // docs/discount-basis-mismatch-audit-and-fix-plan.md).
  const grossTotalInterest = computation.grossTotalInterest;
  const grossTotalLoan = halfUp(computation.principal + grossTotalInterest);
  const grossMonthlyAmortization = halfUp(grossTotalLoan / computation.terms);

  // Invoice Financing (weekly) uses a different computation engine — it has
  // weekly interest-only payments plus one final principal payment, not the
  // standard principal+interest split. Branch before generateAmortizationSchedule.
  const schedule =
    computation.paymentFrequency === "weekly"
      ? invoiceScheduleToInstallments(
          computeInvoiceLoan({
            principal: computation.principal,
            terms: computation.terms,
            releaseDate: new Date(releaseDate),
          }),
        )
      : computation.paymentFrequency === "daily"
        ? // Daily Interest is a single manually-dated payment — persistComputation
          // already stored the CSA-entered payment date as firstPaymentDate and
          // the principal+interest total as totalLoan, so there's nothing left
          // to compute here, just one row. Daily has zero discount units
          // (maxDiscountUnits), so gross vs net is moot here.
          [
            {
              installmentNo: 1,
              dueDate: computation.firstPaymentDate ?? releaseDate,
              amountDue: computation.totalLoan,
            } satisfies AmortizationInstallment,
          ]
        : generateAmortizationSchedule({
          terms: computation.terms,
          monthlyAmortization: grossMonthlyAmortization,
          releaseDate,
          addonMonths: computation.addonMonths,
          dueDay: computation.dueDay ?? 10,
          totalLoan: grossTotalLoan,
          totalInterest: grossTotalInterest,
          // Reuse the already-computed, segment-correct date instead of letting
          // generateAmortizationSchedule recompute it with the Seafarer-only rule.
          firstPaymentDate: computation.firstPaymentDate,
          paymentFrequency: computation.paymentFrequency,
        });

  // Origination discounts (see docs/revision-plans/feature-new-loan-origination-discount.md)
  // target a real, frequency-aware discount unit (Month/Week/Quarter/
  // Payment N — see discount-units.ts), not raw schedule rows directly. A
  // unit's real interest amount, and which raw installment_no rows it
  // covers, come from the exact same generators used to build `schedule`
  // above — a flat average was wrong for Invoice's escalating rate and for
  // Quarterly/Two-monthly's interest-only structure (fixed 2026-08-28).
  // Every frequency's unit covers exactly 1 real row now (confirmed
  // 2026-08-31: CSA discounts a specific payment, never a bundle of several
  // — Salary/Bi-Monthly used to bundle 2 real payments per unit and Invoice
  // used to bundle 4, neither does anymore). Same gross basis as `schedule`
  // above, so amount_due and discount_amount are computed from the same
  // baseline and never double-discount.
  const discountUnits = buildDiscountUnits({
    paymentFrequency: computation.paymentFrequency,
    terms: computation.terms,
    principal: computation.principal,
    totalInterest: grossTotalInterest,
    totalLoan: grossTotalLoan,
    releaseDate,
    firstPaymentDate: computation.firstPaymentDate,
    dueDay: computation.dueDay ?? 10,
  });
  const discountByUnit = new Map<number, number>(
    (computation.originationDiscounts ?? []).map((d) => [d.installmentNo, d.percent]),
  );
  const unitNoByInstallmentNo = new Map<number, number>();
  const interestPerRowByInstallmentNo = new Map<number, number>();
  for (const unit of discountUnits) {
    const perRow = halfUp(unit.interestAmount / unit.installmentNos.length);
    for (const no of unit.installmentNos) {
      unitNoByInstallmentNo.set(no, unit.unitNo);
      interestPerRowByInstallmentNo.set(no, perRow);
    }
  }

  const { error: schedError } = await supabase.from("amortization_schedules").insert(
    schedule.map((row) => {
      const unitNo = unitNoByInstallmentNo.get(row.installmentNo);
      const percent = unitNo != null ? discountByUnit.get(unitNo) : undefined;
      const interestPerRow = interestPerRowByInstallmentNo.get(row.installmentNo) ?? 0;
      const discountAmount =
        percent != null ? halfUp((percent / 100) * interestPerRow) : 0;
      const initialStatus = initialScheduleRowStatus({
        amountDue: row.amountDue,
        discountAmount,
        releaseDate,
      });
      return {
        masterlist_id: masterlist.id,
        installment_no: row.installmentNo,
        due_date: row.dueDate,
        amount_due: row.amountDue,
        discount_amount: discountAmount,
        amount_paid: 0,
        line_type: row.lineType ?? "standard",
        status: initialStatus.status,
        paid_at: initialStatus.paidAt,
      };
    }),
  );

  if (schedError) {
    throw new Error(schedError.message);
  }

  await supabase.from("assignments").insert({
    masterlist_id: masterlist.id,
  });

  await supabase
    .from("ar_queue")
    .update({
      processed_at: new Date().toISOString(),
      masterlist_id: masterlist.id,
    })
    .eq("loan_application_id", loanApplicationId);

  await appendStatusHistory(supabase, loanApplicationId, "loan_active", {
    actorId,
    note: "Loan active — AR masterlist created",
  });

  return { masterlistId: masterlist.id as string, created: true };
}

/**
 * Enroll any LRA-closed files still sitting in `ar_queue` (leftovers from
 * before auto-enroll on close). Idempotent; failures on one row do not
 * block the rest.
 */
export async function enrollUnprocessedArQueue(
  supabase: SupabaseClient,
  actorId?: string,
): Promise<{ enrolled: number; errors: string[] }> {
  const { data, error } = await supabase
    .from("ar_queue")
    .select("loan_application_id, release_file_id")
    .is("processed_at", null);

  if (error) {
    throw new Error(error.message);
  }

  let enrolled = 0;
  const errors: string[] = [];

  for (const row of data ?? []) {
    try {
      const result = await initializeArAccount(
        supabase,
        row.loan_application_id as string,
        row.release_file_id as string,
        actorId,
      );
      if (result.created) enrolled += 1;
    } catch (err) {
      errors.push(
        `${row.loan_application_id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { enrolled, errors };
}

export async function assignMasterlist(
  supabase: SupabaseClient,
  masterlistId: string,
  input: {
    portfolioId?: string | null;
    collectorUserId?: string | null;
    assignedBy: string;
  },
) {
  if (input.portfolioId) {
    const { error } = await supabase
      .from("masterlist")
      .update({ portfolio_id: input.portfolioId })
      .eq("id", masterlistId);

    if (error) throw new Error(error.message);
  }

  if (input.collectorUserId !== undefined) {
    const { error } = await supabase
      .from("assignments")
      .update({
        collector_user_id: input.collectorUserId,
        assigned_by: input.assignedBy,
        assigned_at: new Date().toISOString(),
      })
      .eq("masterlist_id", masterlistId);

    if (error) throw new Error(error.message);
  }
}

/**
 * AR confirms the loan is fully paid — advances application to paid_off.
 * Does not auto-run on last payment; requires explicit AR action.
 */
export async function markPaidOff(
  supabase: SupabaseClient,
  masterlistId: string,
  actorId: string,
) {
  const { data: record, error } = await supabase
    .from("masterlist")
    .select(
      `
      id,
      outstanding_balance,
      account_status,
      loan_application_id,
      amortization_schedules ( status )
    `,
    )
    .eq("id", masterlistId)
    .single();

  if (error || !record) {
    throw new Error(error?.message ?? "Masterlist record not found");
  }

  const applicationId = record.loan_application_id as string;

  const { data: app, error: appError } = await supabase
    .from("loan_applications")
    .select("id, status")
    .eq("id", applicationId)
    .single();

  if (appError || !app) {
    throw new Error(appError?.message ?? "Application not found");
  }

  const schedulesRaw = record.amortization_schedules;
  const schedules = Array.isArray(schedulesRaw) ? schedulesRaw : [];
  const scheduleStatuses = schedules.map((row) =>
    String((row as { status?: string }).status ?? ""),
  );

  const eligibility = canMarkPaidOff({
    applicationStatus: String(app.status),
    outstandingBalance: Number(record.outstanding_balance),
    scheduleStatuses,
  });

  if (!eligibility.ok) {
    throw new PaidOffEligibilityError(eligibility.reason);
  }

  if (record.account_status !== "paid") {
    const { error: mlError } = await supabase
      .from("masterlist")
      .update({ account_status: "paid" })
      .eq("id", masterlistId);

    if (mlError) throw new Error(mlError.message);
  }

  await appendStatusHistory(supabase, applicationId, "paid_off", {
    actorId,
    note: "AR confirmed paid off",
  });

  return { applicationId, status: "paid_off" as const };
}

export async function assignRemedial(
  supabase: SupabaseClient,
  masterlistId: string,
  remedialUserId: string,
  confirmedBy: string,
) {
  const { data: assignment } = await supabase
    .from("assignments")
    .select("collector_user_id")
    .eq("masterlist_id", masterlistId)
    .single();

  await supabase
    .from("masterlist")
    .update({
      remedial_flag: true,
      account_status: "remedial",
      aging_bucket: "91+",
    })
    .eq("id", masterlistId);

  await supabase
    .from("assignments")
    .update({
      remedial_user_id: remedialUserId,
      remedial_assigned_at: new Date().toISOString(),
    })
    .eq("masterlist_id", masterlistId);

  await supabase.from("remedial_turnovers").insert({
    masterlist_id: masterlistId,
    from_collector_id: assignment?.collector_user_id ?? null,
    to_remedial_user_id: remedialUserId,
    confirmed_by: confirmedBy,
    confirmed_at: new Date().toISOString(),
    turnover_reason: "aging_91_plus",
  });
}

export function masterlistToExportRow(row: Record<string, unknown>) {
  return {
    loan_account_no: row.loan_account_no,
    borrower_no: row.borrower_no,
    borrower_name: row.borrower_name,
    principal: row.principal,
    total_loan: row.total_loan,
    net_released: row.net_released,
    monthly_amortization: row.monthly_amortization,
    terms: row.terms,
    first_payment_date: row.first_payment_date,
    release_date: row.release_date,
    loan_type_name: row.loan_type_name,
    manning_agency: row.manning_agency,
    vessel_name: row.vessel_name,
    outstanding_balance: row.outstanding_balance,
    aging_bucket: row.aging_bucket,
    account_status: row.account_status,
    release_paths: Array.isArray(row.release_paths)
      ? (row.release_paths as unknown[]).join(", ")
      : (row.release_paths ?? ""),
    atm_bank_name: row.atm_bank_name,
    atm_card_last4: row.atm_card_last4,
    atm_account_number: row.atm_account_number,
  };
}

export function masterlistToCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const headers = Object.keys(masterlistToExportRow(rows[0]!));
  const lines = [
    headers.join(","),
    ...rows.map((row) => {
      const mapped = masterlistToExportRow(row);
      return headers
        .map((h) => {
          const val = mapped[h as keyof typeof mapped];
          const str = val == null ? "" : String(val);
          return str.includes(",") ? `"${str.replace(/"/g, '""')}"` : str;
        })
        .join(",");
    }),
  ];
  return lines.join("\n");
}
