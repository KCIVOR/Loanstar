import { halfUp } from "./money";

/**
 * Per-installment interest for the Offset early-settlement discount picker.
 *
 * The old CSA route used `total_interest ÷ terms` and stamped that one figure
 * on every future row — wrong whenever the schedule's row count differs from
 * `terms` (weekly ≈ 4 rows/term, semi-monthly 2, Quarterly/Two-Monthly Special
 * 2). That over-stated each row's interest ~4× on a weekly loan, so ticking a
 * few rows looked like it waived the whole interest and the Sept-04 offset
 * came up short. See docs/revision-plans/task-02-offset-full-settlement-plan.md
 * Phase 2.
 *
 * Now derived per row from the schedule's own shape:
 *   - dual-line Special: an `interest` row's own amount IS its interest; a
 *     `principal` row carries none.
 *   - interest-only + balloon (weekly / invoice): the small rows literally are
 *     interest — use each row's own amount; the balloon principal row carries
 *     at most `amount_due − principal`.
 *   - blended (monthly / semi-monthly): even split across the real rows.
 */
export type ScheduleRowForInterest = {
  installmentNo: number;
  amountDue: number;
  lineType: string;
};

export function interestByInstallment(
  rows: ReadonlyArray<ScheduleRowForInterest>,
  comp: { totalInterest: number; principal: number } | undefined,
): Map<number, number> {
  const out = new Map<number, number>();
  const totalInterest = comp?.totalInterest ?? 0;
  const principal = comp?.principal ?? 0;
  const real = rows.filter((r) => r.amountDue > 0);

  // Dual-line Special: line_type is authoritative.
  if (real.some((r) => r.lineType === "interest")) {
    for (const r of real) {
      out.set(r.installmentNo, r.lineType === "interest" ? r.amountDue : 0);
    }
    return out;
  }

  // Balloon detection: one row at/above the principal, and the rest sum to
  // ~the total interest → an interest-only schedule with a principal balloon.
  const maxDue = real.length > 0 ? Math.max(...real.map((r) => r.amountDue)) : 0;
  const balloon =
    principal > 0 && maxDue >= principal * 0.99
      ? real.find((r) => r.amountDue === maxDue)
      : undefined;
  const nonBalloon = real.filter((r) => r !== balloon);
  const nonBalloonSum = nonBalloon.reduce((s, r) => s + r.amountDue, 0);
  const looksInterestOnly =
    balloon !== undefined &&
    totalInterest > 0 &&
    Math.abs(nonBalloonSum - totalInterest) <= totalInterest * 0.05;

  if (looksInterestOnly) {
    for (const r of nonBalloon) out.set(r.installmentNo, r.amountDue);
    if (balloon) {
      out.set(
        balloon.installmentNo,
        Math.max(0, halfUp(balloon.amountDue - principal)),
      );
    }
    return out;
  }

  // Blended monthly / semi-monthly: even split across the real rows.
  const perRow = real.length > 0 ? halfUp(totalInterest / real.length) : 0;
  for (const r of real) out.set(r.installmentNo, perRow);
  return out;
}
