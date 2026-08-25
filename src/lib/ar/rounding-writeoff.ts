import { halfUp } from "@/lib/computation/money";

export type AccountRoundingWriteoffInput = {
  outstandingBalance: number;
  threshold: number;
  scheduleStatuses: string[];
};

export type AccountRoundingWriteoffResult =
  | { ok: true; amount: number }
  | { ok: false; reason: string };

/**
 * Account leftover after every installment is settled — the centavo that
 * never landed on a schedule row (total loan vs monthly × terms).
 */
export function canWriteOffAccountRounding(
  input: AccountRoundingWriteoffInput,
): AccountRoundingWriteoffResult {
  const amount = halfUp(input.outstandingBalance);
  if (amount <= 0) {
    return {
      ok: false,
      reason: "Nothing to write off — outstanding is already zero",
    };
  }

  if (amount > input.threshold) {
    return {
      ok: false,
      reason: `Remaining balance ₱${amount.toFixed(2)} exceeds the rounding write-off limit of ₱${input.threshold.toFixed(2)} — post a normal payment instead`,
    };
  }

  const unpaid = input.scheduleStatuses.filter((status) => {
    const s = status.toLowerCase();
    return s !== "paid" && s !== "rolled";
  });
  if (unpaid.length > 0) {
    return {
      ok: false,
      reason: "Write off the installment remainder instead",
    };
  }

  return { ok: true, amount };
}
