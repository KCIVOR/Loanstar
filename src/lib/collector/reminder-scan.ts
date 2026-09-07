export type ReminderScheduleRow = {
  installmentNo: number;
  dueDate: string;
  amountDue: number;
  /** Origination or early-settlement discount on this installment, if any. */
  discountAmount: number;
  status: string;
};

export const REMINDER_LOOKAHEAD_DAYS = 7;

export function addDaysIso(date: Date, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Earliest unpaid/non-rolled installment with due_date in [today, windowEnd].
 */
export function pickUpcomingInstallment(
  schedules: ReminderScheduleRow[],
  todayStr: string,
  windowEndStr: string,
): ReminderScheduleRow | null {
  const upcoming = schedules
    // Quarterly/Two-Monthly Special loans have a $0 "principal" placeholder
    // row alongside every non-final period's real interest row — excluded
    // here so a reminder is never sent for "your payment of PHP 0.00 is due".
    .filter(
      (s) =>
        s.status !== "paid" &&
        s.status !== "rolled" &&
        s.amountDue > 0 &&
        s.dueDate >= todayStr &&
        s.dueDate <= windowEndStr,
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return upcoming[0] ?? null;
}

export function buildPaymentReminderSms(vars: {
  borrowerName: string;
  loanAccountNo: string;
  dueDate: string;
  amountDue: string;
}): string {
  return (
    `LoanStar reminder: Hi ${vars.borrowerName}, your payment of PHP ${vars.amountDue} ` +
    `for loan ${vars.loanAccountNo} is due on ${vars.dueDate}. Thank you.`
  );
}
