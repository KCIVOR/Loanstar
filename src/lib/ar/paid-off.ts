export type PaidOffEligibilityInput = {
  applicationStatus: string;
  outstandingBalance: number;
  scheduleStatuses: string[];
};

export type PaidOffEligibilityResult =
  | { ok: true }
  | { ok: false; reason: string };

export class PaidOffEligibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaidOffEligibilityError";
  }
}

/**
 * Pure eligibility check for AR "Mark as paid off".
 * Requires loan_active, outstanding ≤ 0, and every installment paid (if any).
 */
export function canMarkPaidOff(
  input: PaidOffEligibilityInput,
): PaidOffEligibilityResult {
  if (input.applicationStatus === "paid_off") {
    return { ok: false, reason: "Application is already paid off" };
  }

  if (input.applicationStatus !== "loan_active") {
    return {
      ok: false,
      reason: "Application must be Loan Active before marking paid off",
    };
  }

  if (input.outstandingBalance > 0) {
    return {
      ok: false,
      reason: "Outstanding balance must be zero before marking paid off",
    };
  }

  // 'rolled' installments are settled — their balance was folded into the
  // installment they rolled into, which still has to reach 'paid' itself.
  const unpaid = input.scheduleStatuses.filter(
    (s) => s !== "paid" && s !== "rolled",
  );
  if (unpaid.length > 0) {
    return {
      ok: false,
      reason: "All installments must be paid before marking paid off",
    };
  }

  return { ok: true };
}
