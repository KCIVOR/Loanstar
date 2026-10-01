import { halfUp } from "@/lib/computation/money";

/**
 * Collector discount, per-installment breakdown
 * (docs/collector-dcr-discount-logic-fix-implementation-plan.md).
 *
 * Before this, only one peso total per discount type was stored and
 * `post_single_dcr_item` even-split it over the selected installments — so
 * mixed percentages, and penalty waivers on rows with unequal fees, applied
 * the wrong amount to each row. Lines carry each installment's own amount.
 *
 * Pure — imported by both DCR pages and the server.
 */
export type DiscountLine = { installmentNo: number; amount: number };

/** Same per-row math as `computeCollectorDiscount` (halfUp(pct% × base) per
 * row), so the sum of these lines equals that function's total exactly. */
export function buildDiscountLines(
  base: Array<{ installmentNo: number; amount: number }>,
  percentByInstallment: Map<number, number>,
): DiscountLine[] {
  const lines: DiscountLine[] = [];
  for (const inst of base) {
    const raw = percentByInstallment.get(inst.installmentNo);
    if (raw === undefined || !(raw > 0)) continue;
    const pct = Math.min(100, Math.max(0, raw));
    const amount = halfUp((pct / 100) * inst.amount);
    if (amount > 0) lines.push({ installmentNo: inst.installmentNo, amount });
  }
  return lines;
}

/**
 * Validates client-supplied lines against the stored total + installment
 * list, or — when an older client sends no lines — derives the legacy
 * even split, so every new dcr_items row stores lines either way.
 */
export function resolveDiscountLines(
  label: "Interest" | "Penalty",
  total: number,
  installmentNos: number[],
  lines: DiscountLine[] | undefined,
): DiscountLine[] {
  if (!(total > 0)) return [];

  if (!lines || lines.length === 0) {
    const unique = Array.from(new Set(installmentNos));
    if (unique.length === 0) return [];
    const share = halfUp(total / unique.length);
    // Preserve the caller's exact total. A simple independently-rounded
    // even split (e.g. 1.00 / 3 = 0.33 × 3) would silently lose a cent when
    // persisted as per-row lines. Keep the legacy-sized shares and put only
    // the rounding remainder on the final selected installment.
    return unique.map((installmentNo, index) => ({
      installmentNo,
      amount:
        index === unique.length - 1
          ? halfUp(total - share * (unique.length - 1))
          : share,
    }));
  }

  const seen = new Set<number>();
  for (const line of lines) {
    if (seen.has(line.installmentNo)) {
      throw new Error(
        `${label} discount lists installment ${line.installmentNo} more than once`,
      );
    }
    seen.add(line.installmentNo);
    if (!(line.amount > 0)) {
      throw new Error(
        `${label} discount on installment ${line.installmentNo} must be greater than zero`,
      );
    }
  }

  const sum = halfUp(lines.reduce((acc, line) => acc + line.amount, 0));
  if (Math.abs(sum - halfUp(total)) > 0.01) {
    throw new Error(
      `${label} discount breakdown (${sum.toFixed(2)}) does not match its total (${halfUp(total).toFixed(2)})`,
    );
  }

  const listed = new Set(installmentNos);
  if (listed.size !== seen.size || [...seen].some((no) => !listed.has(no))) {
    throw new Error(
      `${label} discount breakdown does not match the selected installments`,
    );
  }

  return lines.map((line) => ({
    installmentNo: line.installmentNo,
    amount: halfUp(line.amount),
  }));
}

export function lineAmountFor(
  lines: DiscountLine[],
  installmentNo: number,
): number {
  return lines.find((line) => line.installmentNo === installmentNo)?.amount ?? 0;
}

type DueRow = {
  amountDue: number;
  /** Origination discount already on the row. */
  discountAmount?: number;
  penaltyAmount: number;
  amountPaid: number;
};

/** What the row still owes with no new discount — the posting RPC's Pass A
 * threshold. */
export function grossRemainingDue(row: DueRow): number {
  return Math.max(
    0,
    halfUp(
      row.amountDue -
        (row.discountAmount ?? 0) +
        row.penaltyAmount -
        row.amountPaid,
    ),
  );
}

/** What the row still owes once this payment's Collector discount applies —
 * the posting RPC's Pass B threshold. A Collector interest discount
 * REPLACES the row's origination discount (it never stacks), matching
 * `post_single_dcr_item`. */
export function discountedRemainingDue(
  row: DueRow,
  interestLine: number,
  penaltyLine: number,
): number {
  const interestTerm = interestLine > 0 ? interestLine : (row.discountAmount ?? 0);
  return Math.max(
    0,
    halfUp(
      row.amountDue - interestTerm + row.penaltyAmount - penaltyLine - row.amountPaid,
    ),
  );
}

/** Fill rows in order up to each row's capacity; returns the amount per row.
 * Used to re-fill the Allocate modal net of a selected discount. */
export function fillAllocationAmounts(
  paymentAmount: number,
  capacities: number[],
): number[] {
  let remaining = halfUp(paymentAmount);
  return capacities.map((capacity) => {
    const applied = halfUp(Math.max(0, Math.min(remaining, capacity)));
    remaining = halfUp(remaining - applied);
    return applied;
  });
}
