import { netInstallmentDue } from "@/lib/computation/money";

export type ScheduleLite = {
  installment_no: number;
  due_date: string;
  amount_due: number;
  status: string;
  penalty_amount?: number | null;
  /** Origination or early-settlement discount on this installment, if any. */
  discount_amount?: number | null;
};

export type NextInstallment = {
  installment_no: number;
  due_date: string;
  amount_due: number;
  penalty_amount: number;
  /** Net of discount, penalty included — the real amount still owed (fixed
   * 2026-08-31, see docs/payment-flow-discount-audit-and-fix-plan.md). Kept
   * alongside the raw amount_due/penalty_amount fields (unchanged) so
   * existing callers reading those directly are unaffected. */
  netAmountDue: number;
};

/** True when aging is past current (needs collector attention). */
export function agingNeedsAttention(bucket: string): boolean {
  const b = bucket.trim().toLowerCase();
  if (!b || b === "current") return false;
  return true;
}

/** Earliest unpaid installment by due date, or null if none. */
export function nextOpenInstallment(
  schedules: ScheduleLite[],
): NextInstallment | null {
  const open = schedules
    // Quarterly/Two-Monthly Special loans persist a $0 "principal" placeholder
    // row alongside every non-final period's real interest row (see
    // docs/quarterly-bimonthly-special-schedule-implementation-plan.md) —
    // excluded here so a collector/borrower never sees "₱0.00 due" as if it
    // were the real next payment.
    .filter(
      (s) =>
        !["paid", "rolled"].includes(String(s.status).toLowerCase()) &&
        Number(s.amount_due) > 0,
    )
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const first = open[0];
  if (!first) return null;

  const amountDue = Number(first.amount_due);
  const penaltyAmount = Number(first.penalty_amount ?? 0);

  return {
    installment_no: first.installment_no,
    due_date: first.due_date,
    amount_due: amountDue,
    penalty_amount: penaltyAmount,
    netAmountDue: netInstallmentDue({
      amountDue,
      discountAmount: first.discount_amount,
      penaltyAmount,
    }),
  };
}

export function dcrItemTotal(items: Array<{ amount: number }>): number {
  return items.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
}

/** DCR statuses that still "own" a payment (cannot re-batch). */
export function isActiveDcrStatus(status: string): boolean {
  const s = status.trim().toLowerCase();
  return s === "draft" || s === "submitted" || s === "reconciled";
}

/**
 * Payments already on a submitted/reconciled DCR leave the collector proofs
 * desk. Draft membership stays visible (In DCR badge / current draft).
 */
export function paymentIdsLockedForCollectorDesk(
  rows: Array<{ payment_id: string; dcr_status: string }>,
): Set<string> {
  const locked = new Set<string>();
  for (const row of rows) {
    const s = row.dcr_status.trim().toLowerCase();
    if (s === "submitted" || s === "reconciled") {
      locked.add(row.payment_id);
    }
  }
  return locked;
}

