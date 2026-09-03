import { halfUp } from "./money";

export type CollectorDiscountInstallment = {
  installmentNo: number;
  /** The base this discount is a percentage of — an installment's
   * interestPortion for an interest discount, or its penaltyAmount for a
   * penalty discount. This function is agnostic to which; the caller
   * decides by what it passes in. */
  amount: number;
};

export type CollectorDiscountResult = {
  discountAmount: number;
};

export type CollectorDiscountSelection =
  | Set<number>
  | number[]
  | Map<number, number>
  | Array<{ installmentNo: number; percent?: number }>;

/**
 * Collector discount math (interest or penalty) — see
 * docs/revision-plans/feature-collector-discount-implementation-plan.md,
 * Phase 3. Same percentage-selection mechanic as computeOffsetDiscount,
 * without that function's termination-fee subtraction — that concept is
 * specific to a full-loan-closure offset and does not apply here.
 *
 * Call this once per discount type — once with the selected installments'
 * interest portions, once with the selected installments' penalty amounts.
 * The two results must be kept separate by the caller, never summed:
 * Phase 0's schema stores them in two independent columns and Phase 5
 * applies them to two independent amortization_schedules columns.
 */
export function computeCollectorDiscount(
  eligibleInstallments: CollectorDiscountInstallment[],
  selection: CollectorDiscountSelection,
): CollectorDiscountResult {
  const percentByInstallment = new Map<number, number>();

  if (selection instanceof Map) {
    for (const [no, pct] of selection.entries()) {
      if (pct > 0) percentByInstallment.set(no, Math.min(100, Math.max(0, pct)));
    }
  } else if (Array.isArray(selection)) {
    for (const item of selection) {
      if (typeof item === "number") {
        percentByInstallment.set(item, 100);
      } else if (item && typeof item === "object" && typeof item.installmentNo === "number") {
        const pct = item.percent ?? 100;
        if (pct > 0) percentByInstallment.set(item.installmentNo, Math.min(100, Math.max(0, pct)));
      }
    }
  } else if (selection instanceof Set) {
    for (const no of selection) {
      percentByInstallment.set(no, 100);
    }
  }

  const discountAmount = eligibleInstallments
    .filter((inst) => percentByInstallment.has(inst.installmentNo))
    .reduce((sum, inst) => {
      const pct = percentByInstallment.get(inst.installmentNo) ?? 100;
      return sum + halfUp((pct / 100) * inst.amount);
    }, 0);

  return { discountAmount: Math.max(0, halfUp(discountAmount)) };
}
