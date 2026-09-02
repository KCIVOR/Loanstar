/** HALF-UP rounding to 2 decimal places (G3). Uses centavo integers to avoid float drift. */
export function halfUp(value: number): number {
  return Math.round(Math.round(value * 1000) / 10) / 100;
}

/** Convert peso amount to whole centavos. */
export function toCentavos(value: number): number {
  return Math.round(halfUp(value) * 100);
}

/** Convert centavos back to pesos. */
export function fromCentavos(centavos: number): number {
  return centavos / 100;
}

/** HALF-UP rate multiply: amount × (numerator / denominator). */
export function rateOf(
  amountCentavos: number,
  numerator: number,
  denominator: number,
): number {
  return Math.round((amountCentavos * numerator) / denominator);
}

/** Sum numeric values with HALF-UP at each addition step. */
export function sumHalfUp(...values: number[]): number {
  return values.reduce((acc, value) => halfUp(acc + value), 0);
}

/** The real amount owed on an installment: gross amount_due, net of any
 * origination/early-settlement discount, plus any accrued penalty, minus
 * whatever's already been paid. Every "how much is still owed" calculation
 * in the payment/allocation/aging/display pipeline must go through this —
 * discount_amount was being silently dropped in 9 separate hand-written
 * copies of this formula before 2026-08-31 (see
 * docs/payment-flow-discount-audit-and-fix-plan.md). Never negative — a
 * discount larger than the remaining amount_due (shouldn't happen, capped
 * at validation) still floors at 0 rather than implying credit owed. */
export function netInstallmentDue(input: {
  amountDue: number;
  discountAmount?: number | null;
  penaltyAmount?: number | null;
  amountPaid?: number | null;
}): number {
  const net = halfUp(
    input.amountDue -
      (Number(input.discountAmount) || 0) +
      (Number(input.penaltyAmount) || 0) -
      (Number(input.amountPaid) || 0),
  );
  return Math.max(0, net);
}
