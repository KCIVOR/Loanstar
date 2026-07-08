import type { SupabaseClient } from "@supabase/supabase-js";

import { checkCoverageRatio } from "@/lib/computation/coverage";
import { computeFirstPaymentDate } from "@/lib/computation/release-date";
import { computeSfLoan } from "@/lib/computation/sf";
import type { InputMode, OtherDeductions, SfComputeResult } from "@/lib/computation/types";

export type PersistComputationInput = {
  loanApplicationId: string;
  loanTypeId?: string | null;
  loanTypeName?: string | null;
  inputMode: InputMode;
  amount: number;
  terms: number;
  addonMonths?: number;
  pfRate: number;
  interestRate: number;
  securityFeeRate: number;
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
    computedBy: row.computed_by as string | null,
    signedAt: row.signed_at as string | null,
    signedBy: row.signed_by as string | null,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at as string,
  };
}

export async function persistComputation(
  supabase: SupabaseClient,
  input: PersistComputationInput,
) {
  const result = computeSfLoan({
    inputMode: input.inputMode,
    amount: input.amount,
    terms: input.terms,
    addonMonths: input.addonMonths,
    pfRate: input.pfRate,
    interestRate: input.interestRate,
    securityFeeRate: input.securityFeeRate,
    otherDeductions: input.otherDeductions,
  });

  const coverage = checkCoverageRatio(
    result.monthlyAmortization,
    input.monthlyIncome,
  );

  const releaseDate = input.releaseDate ? new Date(input.releaseDate) : new Date();
  const dueDay = input.dueDay ?? 10;
  const firstPayment = computeFirstPaymentDate(
    releaseDate,
    result.addonMonths,
    dueDay,
  );

  await supabase
    .from("computations")
    .update({ is_active: false })
    .eq("loan_application_id", input.loanApplicationId)
    .eq("is_active", true);

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
      security_fee_rate: input.securityFeeRate,
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
      first_payment_date: firstPayment.toISOString().slice(0, 10),
      due_day: dueDay,
      line_items: buildLineItems(result),
      coverage_ratio: coverage.ratio,
      coverage_warning: coverage.warning,
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
  const { data, error } = await supabase
    .from("computations")
    .select("*")
    .eq("loan_application_id", applicationId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load computation: ${error.message}`);
  }

  return data ? mapComputationRow(data) : null;
}
