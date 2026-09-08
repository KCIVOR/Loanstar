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
import { computeDailyInterestLoan, parseLocalDate } from "@/lib/computation/daily";
import { computeInvoiceLoan } from "@/lib/computation/invoice";
import {
  buildDiscountUnits,
  maxDiscountUnits,
  type ScheduleType,
} from "@/lib/computation/discount-units";
import { computeSfLoan } from "@/lib/computation/sf";
import { computeSmeLoan } from "@/lib/computation/sme";
import { halfUp } from "@/lib/computation/money";
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
  /** SME/Individual only — "car_refinancing" or "real_estate" routes to the
   * SF net-method engine instead of SME gross-up (net method fix). Seafarer
   * never carries collateral (validated at application creation), so this is
   * ignored when segment resolves to seafarer. Default "none". */
  collateralType?: "none" | "car_refinancing" | "real_estate" | null;
  /** Unified schedule/product choice (loan_applications.payment_schedule) —
   * valid for SME **or** Individual, any of the 8 values, either segment
   * (confirmed 2026-08-29: SME may pick MPL/Salary, Individual may pick
   * Invoice/Bi-monthly/Quarterly/Two-monthly/Daily — a deliberate product
   * decision, not a restriction inherited from the old two-field design —
   * see docs/payment-schedule-unification-plan.md). Ignored for Seafarer
   * (always "monthly", enforced by the DB CHECK). Decided at intake, not a
   * free choice at CSA's normal compute time by default — but CSA's compute
   * route and Committee's override path may both pass a *different* value
   * than the application's own payment_schedule (both retain override
   * authority, confirmed 2026-08-28/29). Never leaks past persistComputation
   * as a literal "mpl"/"salary" string — translated into
   * computations.payment_frequency's own, unrelated, 7-value vocabulary. */
  paymentSchedule?:
    | "mpl"
    | "salary"
    | "monthly"
    | "weekly"
    | "bi_monthly"
    | "quarterly"
    | "two_monthly"
    | "daily"
    | "quarterly_special"
    | "two_monthly_special"
    | null;
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
  /** Proposed per-installment discount percentages for this loan's own
   * future schedule, set by CSA/Committee at computation time — applied to
   * the real amortization_schedules rows at release. See
   * docs/revision-plans/feature-new-loan-origination-discount.md. */
  originationDiscounts?: OriginationDiscount[];
  /** Daily Interest only — CSA-entered manual payment date (single payment,
   * not a recurring schedule). Required when the resolved schedule type is
   * "daily"; ignored otherwise. */
  manualPaymentDate?: string | null;
  computedBy: string;
};

export type OriginationDiscount = {
  installmentNo: number;
  percent: number;
};

/** Seafarer's due date must be the borrower's actual payday — one of 5, 15,
 * or 25, never a free-typed number and never silently defaulted (the old
 * default of 10 was never a valid payday). SME/Individual are unrestricted.
 * Returns an error message if invalid, `null` if OK. Shared by the CSA
 * computation route and the Committee override path so the rule can't drift
 * between them — pure so it's testable without a Supabase client. */
export function validateSeafarerDueDay(
  segment: string,
  dueDay: number | undefined,
): string | null {
  if (segment !== "seafarer") return null;
  if (dueDay === undefined || ![5, 15, 25].includes(dueDay)) {
    return "Due date must be 5, 15, or 25 for Seafarer loans";
  }
  return null;
}

/** Collateral (Auto/REM) and payment schedule are never independent choices
 * in either the real Excel calculator or the paper application form —
 * confirmed 2026-08-30 by reading the live workbook's formulas
 * (`IF(OR(I31="auto",I31="REM"), ...)` gates the same single identifier
 * everywhere) and the "Type Of Loan" field on the corporate application
 * form (Business Loan / Auto Loan / REMortgage — one flat choice, never
 * combined with a separate schedule). A collateral loan is always monthly
 * cadence. Returns an error message if invalid, `null` if OK (including
 * every collateral value this rule doesn't apply to). Pure so it's
 * testable without a Supabase client — same shape as
 * `validateSeafarerDueDay`. */
export function validateCollateralPaymentSchedule(
  collateralType: string | null | undefined,
  paymentSchedule: string | null | undefined,
): string | null {
  const hasCollateral =
    collateralType === "car_refinancing" || collateralType === "real_estate";
  if (hasCollateral && paymentSchedule != null && paymentSchedule !== "monthly") {
    return "Auto and Real Estate loans can only use the Regular (Monthly) schedule";
  }
  return null;
}

/** Quarterly and Two-Monthly are interest-only until a final combined
 * interest+principal payment, which only lands cleanly if `terms` divides
 * evenly by the frequency (3 months for quarterly, 2 for two-monthly) — e.g.
 * a 7-month quarterly loan has no clean final quarter. Weekly (Invoice) has
 * its own 1-3 month cap enforced inside `computeInvoiceLoan` and isn't
 * covered here. Returns an error message if invalid, `null` if OK (including
 * every frequency this rule doesn't apply to). Pure so it's testable without
 * a Supabase client — same shape as `validateSeafarerDueDay`. */
export function validateFrequencyTerms(
  paymentFrequency: string | null | undefined,
  terms: number,
): string | null {
  if (
    (paymentFrequency === "quarterly" || paymentFrequency === "quarterly_special") &&
    terms % 3 !== 0
  ) {
    return "Quarterly terms must be divisible by 3 (e.g. 6, 9, or 12 months)";
  }
  if (
    (paymentFrequency === "two_monthly" || paymentFrequency === "two_monthly_special") &&
    terms % 2 !== 0
  ) {
    return "Two-monthly terms must be divisible by 2 (e.g. 4, 6, 8, 10, or 12 months)";
  }
  return null;
}

/** Which computation engine a loan uses: "sf" (net method — principal stays
 * as entered, fees deducted) for Seafarer always, and for SME/Individual
 * WITH collateral (Auto/REM net-method fix); "sme" (gross-up — fees added
 * on top) for SME/Individual with no collateral. Pure so the P1 routing
 * decision itself is directly testable without a Supabase client, same
 * pattern as `validateSeafarerDueDay`. */
export function resolveComputationEngine(
  segment: "seafarer" | "sme" | "individual",
  collateralType: "none" | "car_refinancing" | "real_estate" | null | undefined,
): "sme" | "sf" {
  const hasCollateral =
    collateralType === "car_refinancing" || collateralType === "real_estate";
  if ((segment === "sme" || segment === "individual") && !hasCollateral) {
    return "sme";
  }
  return "sf";
}

/** Each proposed origination discount must target a real discount unit of
 * this loan and be a valid percentage (0-100). "Unit" means different
 * things per schedule type — a calendar month for Monthly/Salary/Bi-Monthly/
 * Invoice, a quarter for Quarterly, a payment for Two-monthly — see
 * `maxDiscountUnits`. Daily has zero valid units (a single already-fixed
 * payment, nothing to discount). Returns an error message for the first
 * invalid entry found, `null` if every entry is valid (including an empty/
 * undefined list). Pure so it's testable without a Supabase client — same
 * shape as `validateSeafarerDueDay`. */
export function validateOriginationDiscounts(
  terms: number,
  discounts: OriginationDiscount[] | undefined,
  paymentFrequency?: ScheduleType,
): string | null {
  if (!discounts || discounts.length === 0) return null;
  const maxUnit = maxDiscountUnits(paymentFrequency, terms);
  for (const { installmentNo, percent } of discounts) {
    if (!Number.isInteger(installmentNo) || installmentNo < 1 || installmentNo > maxUnit) {
      return maxUnit === 0
        ? "This loan's schedule has no discountable installments"
        : `Discount installment number ${installmentNo} is not a valid unit for this ${maxUnit}-unit schedule`;
    }
    if (percent < 0 || percent > 100) {
      return `Discount percent ${percent} must be between 0 and 100`;
    }
  }
  return null;
}

/**
 * The "gross" totalInterest/totalLoan a schedule type's origination discount
 * gets subtracted from. For every schedule type except Invoice (Weekly),
 * this is just the flat principal×terms×rate estimate computeSmeLoan/
 * computeSfLoan already produced — safe, because discount-units.ts derives
 * each real payment's interest by slicing up that exact same total, so it
 * can never disagree.
 *
 * Invoice (Weekly) is the one exception: its real per-week interest is an
 * escalating rate (1% / 2% / 2.5% of principal per month elapsed —
 * computeInvoiceLoan) that has no relationship to the flat estimate. Using
 * the flat estimate as the discount baseline let a real per-week discount
 * exceed it, producing negative stored interest (confirmed 2026-08-31 on
 * live data — see docs/invoice-weekly-interest-corruption-audit-and-fix-plan.md).
 * This overrides the baseline with the real total for Weekly so the
 * subtraction always works off the same number the discount itself was
 * computed from.
 *
 * Pure — safe to call before persisting, same shape as `validateFrequencyTerms`.
 */
export function resolveGrossTotals(
  paymentFrequency: ScheduleType,
  principal: number,
  terms: number,
  flatTotalInterest: number,
  releaseDate: Date,
): { totalInterest: number; totalLoan: number } {
  if (paymentFrequency !== "weekly") {
    return { totalInterest: flatTotalInterest, totalLoan: halfUp(principal + flatTotalInterest) };
  }
  const invoice = computeInvoiceLoan({ principal, terms, releaseDate });
  return {
    totalInterest: invoice.totalInterest,
    totalLoan: halfUp(principal + invoice.totalInterest),
  };
}

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
    // Pre-discount baseline for splitting each real payment's interest share
    // (buildDiscountUnits) — falls back to the net total_interest for rows
    // persisted before 2026-08-31, which never had a discount applied (an
    // undiscounted computation's gross and net are identical by definition).
    grossTotalInterest:
      row.gross_total_interest != null
        ? Number(row.gross_total_interest)
        : Number(row.total_interest),
    totalLoan: Number(row.total_loan),
    monthlyAmortization: Number(row.monthly_amortization),
    releaseDate: row.release_date as string | null,
    firstPaymentDate: row.first_payment_date as string | null,
    dueDay: row.due_day as number | null,
    originationDiscounts: (row.origination_discounts as OriginationDiscount[] | null) ?? null,
    lineItems: row.line_items as Array<{ key: string; label: string; amount: number }>,
    coverageRatio: row.coverage_ratio != null ? Number(row.coverage_ratio) : null,
    coverageWarning: Boolean(row.coverage_warning),
    adminRate: row.admin_rate != null ? Number(row.admin_rate) : null,
    chattelRate: row.chattel_rate != null ? Number(row.chattel_rate) : null,
    chattelFee: row.chattel_fee != null ? Number(row.chattel_fee) : null,
    withDsAndNotary:
      row.with_ds_and_notary != null ? Boolean(row.with_ds_and_notary) : null,
    paymentFrequency: row.payment_frequency as
      | "monthly"
      | "semi_monthly"
      | "weekly"
      | "bi_monthly"
      | "quarterly"
      | "two_monthly"
      | "daily"
      | "quarterly_special"
      | "two_monthly_special",
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

  const hasCollateral =
    input.collateralType === "car_refinancing" ||
    input.collateralType === "real_estate";
  const engine = resolveComputationEngine(segment, input.collateralType);

  let result: SfComputeResult;
  // Set only on the sme/individual branch below; stays null for seafarer.
  let smeChattelFee: number | null = null;
  if (engine === "sme") {
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
    // Seafarer (always), and now also SME/Individual WITH collateral (Auto/REM) —
    // same net-method engine. addonMonths must NOT silently pick up sf.ts's own
    // `?? 2` default for a collateral SME/Individual loan — that default exists
    // for Seafarer's real cutoff-driven cadence, not this product.
    result = computeSfLoan({
      inputMode: input.inputMode,
      amount: input.amount,
      terms: input.terms,
      addonMonths: input.addonMonths ?? 0,
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

  // Unified schedule choice — SME or Individual, any of the 8 values,
  // sourced from the application's own payment_schedule (decided at intake)
  // unless CSA's compute route or Committee's override path pass a
  // different value explicitly. Seafarer ignores it entirely — always
  // "monthly", enforced by the DB CHECK. "mpl"/"salary" never reach
  // computations.payment_frequency as literal strings — this is the
  // translation boundary: mpl behaves exactly like "monthly", salary like
  // "semi_monthly"; every other value passes through unchanged regardless
  // of segment. See docs/payment-schedule-unification-plan.md.
  const paymentFrequency =
    segment === "sme" || segment === "individual"
      ? input.paymentSchedule === "mpl"
        ? "monthly"
        : input.paymentSchedule === "salary"
          ? "semi_monthly"
          : (input.paymentSchedule ?? "monthly")
      : "monthly";
  const isDaily = paymentFrequency === "daily";

  if (isDaily && !input.manualPaymentDate) {
    throw new Error("Daily Interest loans require a manual payment date");
  }

  // Salary needs a real 15th/end-of-month anchor date regardless of segment
  // (SME picking "salary" produces a semi-monthly schedule too, per the
  // paymentFrequency derivation above, and advanceSemiMonthly downstream
  // depends on this anchor's phase being correct) — checked before the
  // segment branch, not after. Every other SME/Individual pick (mpl,
  // monthly, weekly, bi_monthly, quarterly, two_monthly) shares the same
  // "release + 1 month, same day" base rule SME already used for all 6 of
  // its schedule types — the frequency-specific generators (invoice.ts,
  // schedule.ts) build their own real due dates from releaseDate directly
  // and only use this as a stored display fallback. Seafarer alone keeps
  // the old 22nd-cutoff rule. Daily Interest is a single manually-dated
  // payment, not derived at all.
  const firstPayment = isDaily
    ? // Local Y-M-D parse (not `new Date(str)` UTC-midnight) so the stored
      // first_payment_date matches the day the engine below counts to.
      parseLocalDate(input.manualPaymentDate!)
    : input.paymentSchedule === "salary"
      ? computeSalaryFirstPaymentDate(releaseDate, result.addonMonths)
      : segment === "sme" || segment === "individual"
        ? computeSmeFirstPaymentDate(releaseDate, result.addonMonths)
        : computeFirstPaymentDate(releaseDate, result.addonMonths, dueDay);

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

  const grossTotals = resolveGrossTotals(
    paymentFrequency,
    result.principal,
    result.terms,
    result.totalInterest,
    releaseDate,
  );
  result.totalInterest = grossTotals.totalInterest;
  result.totalLoan = grossTotals.totalLoan;
  // Captured before any discount subtraction below — persisted separately
  // (gross_total_interest) so masterlist.ts can later split each real
  // payment's interest share off the true baseline instead of the net
  // total_interest that gets stored below (confirmed 2026-08-31 on
  // AN300434: reading net as if it were gross understated every discounted
  // row's discount_amount by roughly the discounted fraction — see
  // docs/discount-basis-mismatch-audit-and-fix-plan.md).
  const grossTotalInterest = result.totalInterest;

  // Apply origination discounts to the stored totals so that the displayed
  // computation and the amortization schedule built at release both reflect
  // the actual amounts the borrower will pay. Each discount's basis is the
  // REAL interest carried by that discount unit (Month/Quarter/Payment N,
  // see discount-units.ts) — not a flat totalInterest/terms average, which
  // is wrong for Invoice's escalating rate and for Quarterly/Two-monthly's
  // interest-only-until-final structure. totalInterest, totalLoan, and
  // monthlyAmortization are all reduced by the total discounted peso amount.
  // The origination_discounts JSON column is kept as-is for audit and
  // schedule reference.
  let effectiveTotalInterest = result.totalInterest;
  let effectiveTotalLoan = result.totalLoan;
  let effectiveMonthlyAmortization = result.monthlyAmortization;

  if (isDaily) {
    // Daily Interest replaces the standard monthly-amortization totals
    // entirely — interest = principal × monthlyRate ÷ (days in the release
    // month) × (paymentDate − releaseDate), a single payment, matching the
    // SME calculator (docs/Calculator SME.xlsm). Both dates are parsed as
    // local calendar dates (see `firstPayment` above and the local parse of
    // `input.releaseDate` here) so the day the encoder typed is the day that
    // gets counted and divided — `new Date("YYYY-MM-DD")` is UTC midnight and
    // would drift a day (and possibly a month) on a behind-UTC host. The
    // line-470 `releaseDate` is left as-is for the non-daily paths.
    const daily = computeDailyInterestLoan({
      principal: result.principal,
      monthlyRate: input.interestRate,
      releaseDate: input.releaseDate
        ? parseLocalDate(input.releaseDate)
        : releaseDate,
      paymentDate: firstPayment,
    });
    effectiveTotalInterest = daily.interest;
    effectiveTotalLoan = daily.totalDue;
    effectiveMonthlyAmortization = daily.totalDue;
  } else if (input.originationDiscounts && input.originationDiscounts.length > 0) {
    const units = buildDiscountUnits({
      paymentFrequency,
      terms: result.terms,
      principal: result.principal,
      totalInterest: result.totalInterest,
      totalLoan: result.totalLoan,
      releaseDate,
      firstPaymentDate: firstPayment,
      dueDay,
    });
    const unitByNo = new Map(units.map((u) => [u.unitNo, u]));
    let totalDiscountPeso = 0;
    for (const { installmentNo, percent } of input.originationDiscounts) {
      const unit = unitByNo.get(installmentNo);
      if (!unit) continue; // validateOriginationDiscounts already rejects this before compute
      totalDiscountPeso += halfUp((percent / 100) * unit.interestAmount);
    }
    totalDiscountPeso = halfUp(totalDiscountPeso);
    effectiveTotalInterest = halfUp(result.totalInterest - totalDiscountPeso);
    if (effectiveTotalInterest < 0) {
      // Should be mathematically impossible once result.totalInterest is the
      // real per-schedule total (see the Weekly override above) — a discount
      // unit's interestAmount always comes from the exact same total this is
      // subtracted from, so a valid 0-100% discount can never exceed it. A
      // negative result here means some future schedule type introduced the
      // same real-vs-flat mismatch Weekly had — fail loudly instead of
      // silently persisting negative interest.
      throw new Error(
        `Discount total (₱${totalDiscountPeso}) exceeds gross interest (₱${result.totalInterest}) for this ${paymentFrequency} schedule — refusing to persist negative interest`,
      );
    }
    effectiveTotalLoan = halfUp(result.principal + effectiveTotalInterest);
    effectiveMonthlyAmortization = halfUp(effectiveTotalLoan / result.terms);
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
        segment === "sme" || segment === "individual" || hasCollateral
          ? 0
          : input.securityFeeRate,
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
      total_interest: effectiveTotalInterest,
      gross_total_interest: isDaily ? null : grossTotalInterest,
      total_loan: effectiveTotalLoan,
      monthly_amortization: effectiveMonthlyAmortization,
      release_date: releaseDate.toISOString().slice(0, 10),
      first_payment_date: formatDateLocal(firstPayment),
      due_day: dueDay,
      origination_discounts: input.originationDiscounts ?? null,
      line_items: buildLineItems({
        ...result,
        totalInterest: effectiveTotalInterest,
        totalLoan: effectiveTotalLoan,
        monthlyAmortization: effectiveMonthlyAmortization,
      }),
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
