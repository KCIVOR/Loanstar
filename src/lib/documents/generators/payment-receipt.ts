import type { SupabaseClient } from "@supabase/supabase-js";

import { mapBorrowerRow, type BorrowerRow } from "@/lib/borrowers/types";
import { renderAndStore, type RenderedDocumentResult } from "@/lib/documents/render-store";

import { COMPANY_NAME, formatDate, formatMoney, joinAddress } from "./shared";

export type PaymentReceiptInput = {
  borrowerName: string;
  address: string;
  loanAccountNo: string;
  paymentAmount: number;
  paymentDate: string;
  referenceNo: string;
  /** Collector Discount (feature-collector-discount-implementation-plan.md,
   * Phase 9) — the two waivers are independent (Rule 1), never merged into
   * one figure, mirroring how dcr_items itself stores them. */
  interestDiscountAmount: number;
  interestDiscountedInstallmentNos: number[];
  penaltyDiscountAmount: number;
  penaltyDiscountedInstallmentNos: number[];
  discountReason: string | null;
  todayDate: string;
};

/**
 * Pure merge-context builder for the payment_receipt template. Kept
 * side-effect free so the discount-breakdown math is unit-testable without
 * a DB, matching buildDemandLetterContext's own convention.
 */
export function buildPaymentReceiptContext(
  input: PaymentReceiptInput,
): Record<string, unknown> {
  const hasInterestDiscount = input.interestDiscountAmount > 0;
  const hasPenaltyDiscount = input.penaltyDiscountAmount > 0;
  const hasDiscount = hasInterestDiscount || hasPenaltyDiscount;
  const totalDiscountAmount = input.interestDiscountAmount + input.penaltyDiscountAmount;

  return {
    companyName: COMPANY_NAME,
    borrowerName: input.borrowerName,
    address: input.address,
    loanAccountNo: input.loanAccountNo,
    paymentAmount: formatMoney(input.paymentAmount),
    paymentDate: input.paymentDate,
    referenceNo: input.referenceNo,
    todayDate: input.todayDate,
    hasDiscount,
    hasInterestDiscount,
    interestDiscountAmount: formatMoney(input.interestDiscountAmount),
    interestDiscountedInstallments: input.interestDiscountedInstallmentNos
      .slice()
      .sort((a, b) => a - b)
      .join(", "),
    hasPenaltyDiscount,
    penaltyDiscountAmount: formatMoney(input.penaltyDiscountAmount),
    penaltyDiscountedInstallments: input.penaltyDiscountedInstallmentNos
      .slice()
      .sort((a, b) => a - b)
      .join(", "),
    totalDiscountAmount: formatMoney(totalDiscountAmount),
    discountReason: input.discountReason ?? "",
  };
}

/**
 * Generate a payment receipt for a posted payment and store it as a
 * rendered_documents row (module = collection). One receipt per payment —
 * always replaces a prior unsigned draft of the same payment rather than
 * accumulating, unlike the Demand Letter series (there is only ever one
 * real receipt per payment, not an escalation ladder).
 *
 * A discount only ever shows on the receipt if it was actually applied —
 * this reads discount_amount/penalty_discount_amount straight off the
 * amortization_schedules row(s) the payment posted against (Phase 5's
 * already-decided, final state), not the dcr_items draft figures, which
 * may have been entered but never taken effect (Option B).
 */
export async function generatePaymentReceipt(
  supabase: SupabaseClient,
  params: {
    paymentId: string;
    actorId: string;
  },
): Promise<RenderedDocumentResult> {
  const { paymentId, actorId } = params;

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select(
      `
      id, amount, payment_date, reference_no, status, masterlist_id, loan_application_id,
      masterlist ( loan_account_no, borrower_id )
      `,
    )
    .eq("id", paymentId)
    .single();

  if (paymentError || !payment) {
    throw new Error(paymentError?.message ?? "Payment not found");
  }
  if (payment.status !== "posted") {
    throw new Error("Only a posted payment can generate a receipt");
  }

  const applicationId = payment.loan_application_id as string;
  if (!applicationId) {
    throw new Error("Payment is not linked to a loan application");
  }

  const masterlistRaw = payment.masterlist as
    | { loan_account_no: string | null; borrower_id: string | null }
    | { loan_account_no: string | null; borrower_id: string | null }[]
    | null;
  const masterlistRow = Array.isArray(masterlistRaw) ? masterlistRaw[0] : masterlistRaw;

  const { data: borrowerRaw } = await supabase
    .from("borrowers")
    .select("*")
    .eq("id", masterlistRow?.borrower_id ?? "")
    .maybeSingle();
  const borrowerRow = borrowerRaw as BorrowerRow | null;
  const borrowerName = borrowerRow
    ? [borrowerRow.first_name, borrowerRow.middle_name, borrowerRow.last_name]
        .filter(Boolean)
        .join(" ")
    : "";
  const address = borrowerRow ? joinAddress(mapBorrowerRow(borrowerRow).presentAddress) : "";

  // The one live dcr_items row for this payment, if any. A rejected attempt
  // deletes its dcr_items row entirely (Phase 8) — nothing left to read,
  // correctly. Absent entirely (e.g. an ordinary payment with no discount
  // ever entered) is equally valid — every field below defaults to 0/null.
  const { data: dcrItem } = await supabase
    .from("dcr_items")
    .select(
      "interest_discount_amount, interest_discounted_installment_nos, penalty_discount_amount, penalty_discounted_installment_nos, discount_reason",
    )
    .eq("payment_id", paymentId)
    .maybeSingle();

  // Only a discount that actually took effect (Phase 5's Pass A/B decision,
  // Option B) belongs on the receipt — read it off the real schedule
  // row(s), not the dcr_items draft figures, which may have been entered
  // but never applied.
  const discountedInstallmentNos = [
    ...(dcrItem?.interest_discounted_installment_nos ?? []),
    ...(dcrItem?.penalty_discounted_installment_nos ?? []),
  ] as number[];

  let appliedInterestDiscount = 0;
  let appliedInterestInstallmentNos: number[] = [];
  let appliedPenaltyDiscount = 0;
  let appliedPenaltyInstallmentNos: number[] = [];

  if (discountedInstallmentNos.length > 0) {
    const { data: scheduleRows } = await supabase
      .from("amortization_schedules")
      .select("installment_no, discount_amount, discount_source, penalty_discount_amount")
      .eq("masterlist_id", payment.masterlist_id as string)
      .in("installment_no", discountedInstallmentNos);

    for (const row of scheduleRows ?? []) {
      if (row.discount_source === "collector" && Number(row.discount_amount) > 0) {
        appliedInterestDiscount += Number(row.discount_amount);
        appliedInterestInstallmentNos.push(row.installment_no as number);
      }
      if (Number(row.penalty_discount_amount) > 0) {
        appliedPenaltyDiscount += Number(row.penalty_discount_amount);
        appliedPenaltyInstallmentNos.push(row.installment_no as number);
      }
    }
  }

  const context = buildPaymentReceiptContext({
    borrowerName,
    address,
    loanAccountNo: (masterlistRow?.loan_account_no as string) ?? "",
    paymentAmount: Number(payment.amount),
    paymentDate: formatDate(payment.payment_date as string),
    referenceNo: (payment.reference_no as string) ?? "",
    interestDiscountAmount: appliedInterestDiscount,
    interestDiscountedInstallmentNos: appliedInterestInstallmentNos,
    penaltyDiscountAmount: appliedPenaltyDiscount,
    penaltyDiscountedInstallmentNos: appliedPenaltyInstallmentNos,
    discountReason: (dcrItem?.discount_reason as string) ?? null,
    todayDate: formatDate(new Date()),
  });

  return renderAndStore(supabase, {
    slug: "payment_receipt",
    module: "collection",
    applicationId,
    context,
    actorId,
    // One real receipt per payment — supersede a prior unsigned draft
    // rather than accumulating (unlike the Demand Letter series).
    replaceUnsigned: true,
  });
}
