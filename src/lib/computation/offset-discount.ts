import { halfUp } from "./money";

export type OffsetDiscountInstallment = {
  installmentNo: number;
  interestPortion: number;
};

export type OffsetDiscountResult = {
  grossInterest: number;
  terminationFee: number;
  netDiscount: number;
};

export type OffsetDiscountSelection =
  | Set<number>
  | number[]
  | Map<number, number>
  | Array<{ installmentNo: number; percent?: number }>;

/**
 * Early-settlement (Offset) discount math — see
 * docs/revision-plans/feature-early-settlement-discount.md, Rule 3. Gross
 * interest is the sum of every ticked installment's interest (or custom
 * percentage of that interest); the termination fee is one month's
 * contractual interest (any future installment of the same loan carries the
 * same figure — Phase 4's even-split convention); the net discount is the
 * difference, floored at 0 so two or fewer ticked months never go negative.
 */
export function computeOffsetDiscount(
  futureInstallments: OffsetDiscountInstallment[],
  selection: OffsetDiscountSelection,
): OffsetDiscountResult {
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

  const terminationFee = futureInstallments[0]?.interestPortion ?? 0;
  const grossInterest = futureInstallments
    .filter((inst) => percentByInstallment.has(inst.installmentNo))
    .reduce((sum, inst) => {
      const pct = percentByInstallment.get(inst.installmentNo) ?? 100;
      return sum + halfUp((pct / 100) * inst.interestPortion);
    }, 0);

  const netDiscount = Math.max(0, halfUp(grossInterest - terminationFee));
  return { grossInterest: halfUp(grossInterest), terminationFee, netDiscount };
}
