import type { SupabaseClient } from "@supabase/supabase-js";

import {
  checkCoverageRatio,
  getCoverageThreshold,
  skipCoverageForSegment,
} from "@/lib/computation/coverage";
import {
  computeFirstPaymentDate,
  computeSalaryFirstPaymentDate,
  computeSmeFirstPaymentDate,
  formatDateLocal,
} from "@/lib/computation/release-date";
import { computeSfLoan } from "@/lib/computation/sf";
import { computeSmeLoan } from "@/lib/computation/sme";
import type {
  InputMode,
  OtherDeductions,
  SfComputeResult,
} from "@/lib/computation/types";
import {
  loadActiveObligations,
  sumActiveObligations,
} from "@/lib/borrowers/existing-obligations";
import { createServiceClient } from "@/lib/supabase/server";

export type PersistComputationInput = {
  loanApplicationId: string;
  /** Application segment — selects SF vs SME engine. Individual reuses the SME
   * engine (confirmed 2026-08-19 — same calculator, same rates). Defaults to seafarer. */
  segment?: "seafarer" | "sme" | "individual" | null;
  /** Individual only — MPL (monthly, reuses SME's date rule) vs Salary
   * (semi-monthly). Drives first-payment-date and payment_frequency. */
  individualLoanType?: "mpl" | "salary" | null;
  loanTypeId?: string | null;
  loanTypeName?: string | null;
  inputMode: InputMode;
  amount: number;
  terms: number;
  addonMonths?: number;
  pfRate: number;
  interestRate: number;
  securityFeeRate: number;
  /** SME only — loan_desired × admin_rate (outside PF bundle). Default 0. */
  adminRate?: number;
  /** SME only — principal × chattel_rate (CMF). Default 0. */
  chattelRate?: number;
  /** SME only — per-account DS & Notary flag. Default true. */
  withDsAndNotary?: boolean;
  otherDeductions?: OtherDeductions;
  releaseDate?: string | null;
  dueDay?: number;
  monthlyIncome?: number | null;
  computedBy: string;
};

export function buildLineItems(result: SfComputeResult) {
  return [
    { key: "processing_fee", label: "Processing Fee", amount: result.processingFee },
    { key: "admin_cost", label: "Admin Cost", amount: result.adminCost },
    { key: "doc_stamp", label: "Doc Stamp", amount: result.docStamp },
    { key: "notary_fee", label: "Notary Fee", amount: result.notaryFee },
    { key: "security_fee", label: "Security Fee", amount: result.securityFee },
    { key: "other_deductions", label: "Other Deductions", amount: result.otherDeductionsTotal },
    { key: "total_deductions", label: "Total Deductions", amount: result.totalDeductions },
    { key: "net_released", label: "Net Released", amount: result.netReleased },
    { key: "total_interest", label: "Total Interest", amount: result.totalInterest },
    { key: "total_loan", label: "Total Loan", amount: result.totalLoan },
    { key: "monthly_amortization", label: "Monthly Amortization", amount: result.monthlyAmortization },
  ];
}

function smeToSfResult(
  input: PersistComputationInput,
  sme: ReturnType<typeof computeSmeLoan>,
): SfComputeResult {
  return {
    inputMode: input.inputMode,
    inputAmount: input.amount,
    terms: sme.terms,
    addonMonths: sme.addonMonths,
    pfRate: sme.pfRate,
    interestRate: sme.interestRate,
    securityFeeRate: 0,
    otherDeductions: sme.otherDeductions,
    otherDeductionsTotal: sme.otherDeductionsTotal,
    principal: sme.principal,
    pfTotal: sme.pfBundle,
    processingFee: sme.processingFee,
    docStamp: sme.docStamp,
    notaryFee: sme.notaryFee,
    adminCost: sme.adminCost,
    pfBundle: sme.pfBundle,
    securityFee: sme.securityFee,
    totalDeductions: sme.totalDeductions,
    netReleased: sme.netReleased,
    totalInterest: sme.totalInterest,
    totalLoan: sme.totalLoan,
    monthlyAmortization: sme.monthlyAmortization,
  };
}

export function mapComputationRow(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    loanApplicationId: row.loan_application_id as string,
    version: row.version as number,
    inputMode: row.input_mode as InputMode,
    inputAmount: Number(row.input_amount),
    terms: row.terms as number,
    addonMonths: row.addon_months as number,
    pfRate: Number(row.pf_rate),
    interestRate: Number(row.interest_rate),
    securityFeeRate: Number(row.security_fee_rate),
    loanTypeId: row.loan_type_id as string | null,
    loanTypeName: row.loan_type_name as string | null,
    otherDeductions: row.other_deductions as OtherDeductions,
    principal: Number(row.principal),
    processingFee: Number(row.processing_fee),
    adminCost: Number(row.admin_cost),
    docStamp: Number(row.doc_stamp),
    notaryFee: Number(row.notary_fee),
    securityFee: Number(row.security_fee),
    otherDeductionsTotal: Number(row.other_deductions_total),
    totalDeductions: Number(row.total_deductions),
    netReleased: Number(row.net_released),
    totalInterest: Number(row.total_interest),
    totalLoan: Number(row.total_loan),
    monthlyAmortization: Number(row.monthly_amortization),
    releaseDate: row.release_date as string | null,
    firstPaymentDate: row.first_payment_date as string | null,
    dueDay: row.due_day as number | null,
    lineItems: row.line_items as Array<{ key: string; label: string; amount: number }>,
    coverageRatio: row.coverage_ratio != null ? Number(row.coverage_ratio) : null,
    coverageWarning: Boolean(row.coverage_warning),
    adminRate: row.admin_rate != null ? Number(row.admin_rate) : null,
    chattelRate: row.chattel_rate != null ? Number(row.chattel_rate) : null,
    chattelFee: row.chattel_fee != null ? Number(row.chattel_fee) : null,
    withDsAndNotary:
      row.with_ds_and_notary != null ? Boolean(row.with_ds_and_notary) : null,
    paymentFrequency: row.payment_frequency as "monthly" | "semi_monthly",
    computedBy: row.computed_by as string | null,
    signedAt: row.signed_at as string | null,
    signedBy: row.signed_by as string | null,
    witnessedBy: row.witnessed_by as string | null,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at as string,
  };
}

export async function persistComputation(
  supabase: SupabaseClient,
  input: PersistComputationInput,
) {
  const segment =
    input.segment === "sme" || input.segment === "individual"
      ? input.segment
      : "seafarer";

  let result: SfComputeResult;
  // Set only on the sme/individual branch below; stays null for seafarer.
  let smeChattelFee: number | null = null;
  if (segment === "sme" || segment === "individual") {
    // Loan Desired mode: CSA `amount` is treated as loan_desired (extraction §4).
    // SF inputMode is still stored for DB CHECK compatibility; it does not drive SME math.
    const sme = computeSmeLoan({
      loanDesired: input.amount,
      terms: input.terms,
      addonMonths: input.addonMonths ?? 0,
      pfRate: input.pfRate,
      interestRate: input.interestRate,
      adminRate: input.adminRate ?? 0,
      chattelRate: input.chattelRate ?? 0,
      withDsAndNotary: input.withDsAndNotary ?? true,
      otherDeductions: input.otherDeductions,
    });
    smeChattelFee = sme.chattelFee;
    result = smeToSfResult(input, sme);
  } else {
    result = computeSfLoan({
      inputMode: input.inputMode,
      amount: input.amount,
      terms: input.terms,
      addonMonths: input.addonMonths,
      pfRate: input.pfRate,
      interestRate: input.interestRate,
      securityFeeRate: input.securityFeeRate,
      otherDeductions: input.otherDeductions,
    });
  }

  // SME: skip Seafarer 35% personal-income coverage — see coverage.ts.
  // Store null ratio so endorse does not inherit a meaningless figure.
  // Seafarer and Individual: include other active masterlist amorts in the ratio.
  let otherMonthlyAmortization = 0;
  let coverage: {
    ratio: number | null;
    warning: boolean;
    message: string | null;
    otherMonthlyAmortization: number;
  };

  if (skipCoverageForSegment(segment)) {
    coverage = {
      ratio: null,
      warning: false,
      message: null,
      otherMonthlyAmortization: 0,
    };
  } else {
    // Load borrower_id for this application to fetch other obligations.
    const { data: appRow } = await supabase
      .from("loan_applications")
      .select("borrower_id")
      .eq("id", input.loanApplicationId)
      .maybeSingle();

    if (appRow?.borrower_id) {
      // masterlist RLS only grants SELECT to super_admin, accounting_ar, the
      // borrower, or the assigned collector — CSA has none of those, so this
      // must read via service role or it silently sees zero rows.
      const obligationRows = await loadActiveObligations(
        createServiceClient(),
        appRow.borrower_id as string,
      );
      const obligations = sumActiveObligations(
        obligationRows,
        input.loanApplicationId,
      );
      otherMonthlyAmortization = obligations.otherMonthlyAmortization;
    }

    const combinedAmort =
      result.monthlyAmortization + otherMonthlyAmortization;
    const base = checkCoverageRatio(
      combinedAmort,
      input.monthlyIncome,
      await getCoverageThreshold(supabase),
    );
    coverage = { ...base, otherMonthlyAmortization };
  }

  const releaseDate = input.releaseDate ? new Date(input.releaseDate) : new Date();
  const dueDay = input.dueDay ?? 10;
  // SME, and MPL (individual_loan_type "mpl"): release + 1 month, same day,
  // no cutoff, no addon-months adjustment. Salary (individual_loan_type
  // "salary"): semi-monthly — next 15th/end-of-month on or after release.
  // Seafarer, Auto/REM, and any individual row with no individual_loan_type
  // set keep the old 22nd-cutoff rule unchanged.
  const firstPayment =
    segment === "sme" || input.individualLoanType === "mpl"
      ? computeSmeFirstPaymentDate(releaseDate)
      : input.individualLoanType === "salary"
        ? computeSalaryFirstPaymentDate(releaseDate)
        : computeFirstPaymentDate(releaseDate, result.addonMonths, dueDay);
  const paymentFrequency: "monthly" | "semi_monthly" =
    input.individualLoanType === "salary" ? "semi_monthly" : "monthly";

  // Deactivate prior actives with service role: CSA RLS cannot update rows
  // that already have signed_at set, which left multiple is_active=true rows
  // and broke detail GET (.maybeSingle()).
  const admin = createServiceClient();
  const { error: deactivateError } = await admin
    .from("computations")
    .update({ is_active: false })
    .eq("loan_application_id", input.loanApplicationId)
    .eq("is_active", true);

  if (deactivateError) {
    throw new Error(
      `Failed to deactivate prior computations: ${deactivateError.message}`,
    );
  }

  const { count } = await supabase
    .from("computations")
    .select("id", { count: "exact", head: true })
    .eq("loan_application_id", input.loanApplicationId);

  const { data, error } = await supabase
    .from("computations")
    .insert({
      loan_application_id: input.loanApplicationId,
      version: (count ?? 0) + 1,
      input_mode: input.inputMode,
      input_amount: input.amount,
      terms: input.terms,
      addon_months: result.addonMonths,
      pf_rate: input.pfRate,
      interest_rate: input.interestRate,
      security_fee_rate:
        segment === "sme" || segment === "individual" ? 0 : input.securityFeeRate,
      loan_type_id: input.loanTypeId ?? null,
      loan_type_name: input.loanTypeName ?? null,
      other_deductions: result.otherDeductions,
      principal: result.principal,
      processing_fee: result.processingFee,
      admin_cost: result.adminCost,
      doc_stamp: result.docStamp,
      notary_fee: result.notaryFee,
      security_fee: result.securityFee,
      other_deductions_total: result.otherDeductionsTotal,
      total_deductions: result.totalDeductions,
      net_released: result.netReleased,
      total_interest: result.totalInterest,
      total_loan: result.totalLoan,
      monthly_amortization: result.monthlyAmortization,
      release_date: releaseDate.toISOString().slice(0, 10),
      first_payment_date: formatDateLocal(firstPayment),
      due_day: dueDay,
      line_items: buildLineItems(result),
      coverage_ratio: coverage.ratio,
      coverage_warning: coverage.warning,
      admin_rate: input.adminRate ?? null,
      chattel_rate: input.chattelRate ?? null,
      chattel_fee: smeChattelFee,
      with_ds_and_notary: input.withDsAndNotary ?? null,
      payment_frequency: paymentFrequency,
      computed_by: input.computedBy,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to save computation: ${error.message}`);
  }

  return {
    computation: mapComputationRow(data),
    result,
    coverage,
  };
}

export async function getActiveComputation(
  supabase: SupabaseClient,
  applicationId: string,
) {
  // Prefer latest version if duplicates ever exist (e.g. signed row that
  // could not be deactivated under CSA RLS).
  const { data, error } = await supabase
    .from("computations")
    .select("*")
    .eq("loan_application_id", applicationId)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load computation: ${error.message}`);
  }

  return data ? mapComputationRow(data) : null;
}

export type SmeRateHistoryEntry = {
  applicationNo: string | null;
  createdAt: string;
  pfRate: number;
  interestRate: number;
  adminRate: number | null;
  chattelRate: number | null;
};

/**
 * A borrower's past sme/individual computations, most recent first — shown
 * as read-only reference in the CSA panel, and used to pre-fill the rate
 * inputs for a reloan. Never a locked "enrollment": Committee (and CSA) can
 * always override it. Scoped to the *same* segment as the current
 * application — sme and individual are different products with different
 * normal rate shapes (individual's admin/CMF are normally 0), so pooling
 * them would produce a misleading "last used" default (confirmed decision).
 *
 * Uses the regular request-scoped client, not service role — `computations`
 * RLS is module-wide for CSA/Committee (`has_module_permission('computation',
 * 'view')`), unlike masterlist's narrower policy, so no workaround is needed.
 */
export async function getSmeRateHistory(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<SmeRateHistoryEntry[]> {
  const { data: appRow } = await supabase
    .from("loan_applications")
    .select("borrower_id, segment")
    .eq("id", applicationId)
    .maybeSingle();

  if (!appRow?.borrower_id) return [];
  const segment = appRow.segment;
  if (segment !== "sme" && segment !== "individual") return [];

  const { data, error } = await supabase
    .from("computations")
    .select(
      "pf_rate, interest_rate, admin_rate, chattel_rate, created_at, loan_application_id, loan_applications!inner(application_no, borrower_id, segment)",
    )
    .eq("loan_applications.borrower_id", appRow.borrower_id)
    .eq("loan_applications.segment", segment)
    .neq("loan_application_id", applicationId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    throw new Error(`Failed to load rate history: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const app = Array.isArray(row.loan_applications)
      ? row.loan_applications[0]
      : row.loan_applications;
    return {
      applicationNo: (app?.application_no as string | null) ?? null,
      createdAt: row.created_at as string,
      pfRate: Number(row.pf_rate),
      interestRate: Number(row.interest_rate),
      adminRate: row.admin_rate != null ? Number(row.admin_rate) : null,
      chattelRate: row.chattel_rate != null ? Number(row.chattel_rate) : null,
    };
  });
}
