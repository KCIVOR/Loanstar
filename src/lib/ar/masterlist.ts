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

/**
 * Denormalized employment/identity columns on masterlist.
 * SME reuses manning_agency / vessel_name for company + nature (no schema change).
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
  return {
    manningAgency: (input.manningAgencyName ?? "").trim() || null,
    vesselName: (input.vesselName ?? "").trim() || null,
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
  const segment = app.segment === "sme" ? "sme" : "seafarer";

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
      release_path: releaseFile?.release_path ?? null,
      atm_bank_name: releaseFile?.atm_bank_name ?? null,
      atm_card_last4: releaseFile?.atm_card_last4 ?? null,
      outstanding_balance: computation.totalLoan,
      aging_bucket: "current",
      account_status: "active",
    })
    .select("id")
    .single();

  if (mlError || !masterlist) {
    throw new Error(mlError?.message ?? "Failed to create masterlist record");
  }

  const schedule = generateAmortizationSchedule({
    terms: computation.terms,
    monthlyAmortization: computation.monthlyAmortization,
    releaseDate,
    addonMonths: computation.addonMonths,
    dueDay: computation.dueDay ?? 10,
  });

  const { error: schedError } = await supabase.from("amortization_schedules").insert(
    schedule.map((row) => ({
      masterlist_id: masterlist.id,
      installment_no: row.installmentNo,
      due_date: row.dueDate,
      amount_due: row.amountDue,
      status: "pending",
    })),
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
    release_path: row.release_path,
    atm_bank_name: row.atm_bank_name,
    atm_card_last4: row.atm_card_last4,
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
