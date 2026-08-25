import type { OtherDeductions } from "./types";

export type DeductionBreakdownRow = { label: string; amount: number };

function offsetLabel(accountNo: string | null, months: number | null): string {
  if (!accountNo) return "Offset";
  if (months) return `Offset (${accountNo} · ${months} mo${months > 1 ? "s" : ""})`;
  return `Offset (${accountNo})`;
}

function otherLoanLabel(accountNo: string | null): string {
  return accountNo ? `Other Loan (${accountNo})` : "Other Loan";
}

/**
 * Pure display helper: expands the stored deduction shape into one row per
 * entry for UI/document breakdowns. Mirrors the "array wins over legacy
 * scalar" rule the calculation engines already use, so this never disagrees
 * with what was actually charged.
 */
export function buildDeductionBreakdownRows(
  od: OtherDeductions | null | undefined,
): DeductionBreakdownRow[] {
  if (!od) return [];
  const rows: DeductionBreakdownRow[] = [];

  const otherLoans =
    od.otherLoans && od.otherLoans.length > 0
      ? od.otherLoans
      : (od.otherLoan ?? 0) > 0
        ? [{ accountNo: od.otherLoanAccountNo ?? null, amount: od.otherLoan! }]
        : [];
  for (const entry of otherLoans) {
    if (entry.amount > 0) {
      rows.push({ label: otherLoanLabel(entry.accountNo), amount: entry.amount });
    }
  }

  const offsets =
    od.offsets && od.offsets.length > 0
      ? od.offsets
      : (od.offset ?? 0) > 0
        ? [{ accountNo: od.offsetAccountNo ?? null, amount: od.offset!, months: od.offsetMonths ?? null }]
        : [];
  for (const entry of offsets) {
    if (entry.amount > 0) {
      rows.push({ label: offsetLabel(entry.accountNo, entry.months), amount: entry.amount });
    }
  }

  if (od.advancePayment) rows.push({ label: "Advance Payment", amount: od.advancePayment });
  if (od.previousLoanBalance) rows.push({ label: "Previous Loan Balance", amount: od.previousLoanBalance });
  if (od.accountOpening) rows.push({ label: "Account Opening", amount: od.accountOpening });

  return rows;
}

export type DeductionTarget = {
  accountNo: string;
  amount: number;
  transferType: "other_loan" | "offset";
  months: number | null;
};

/**
 * Same array-wins-over-legacy-scalar extraction as `buildDeductionBreakdownRows`,
 * but structured for downstream posting (e.g. internal transfers) instead of
 * display — entries with no account number are skipped since there's no
 * target to post against.
 */
export function extractDeductionTargets(
  od: OtherDeductions | null | undefined,
): DeductionTarget[] {
  if (!od) return [];
  const targets: DeductionTarget[] = [];

  const otherLoans =
    od.otherLoans && od.otherLoans.length > 0
      ? od.otherLoans
      : (od.otherLoan ?? 0) > 0
        ? [{ accountNo: od.otherLoanAccountNo ?? null, amount: od.otherLoan! }]
        : [];
  for (const entry of otherLoans) {
    if (entry.accountNo && entry.amount > 0) {
      targets.push({
        accountNo: entry.accountNo,
        amount: entry.amount,
        transferType: "other_loan",
        months: null,
      });
    }
  }

  const offsets =
    od.offsets && od.offsets.length > 0
      ? od.offsets
      : (od.offset ?? 0) > 0
        ? [{ accountNo: od.offsetAccountNo ?? null, amount: od.offset!, months: od.offsetMonths ?? null }]
        : [];
  for (const entry of offsets) {
    if (entry.accountNo && entry.amount > 0) {
      targets.push({
        accountNo: entry.accountNo,
        amount: entry.amount,
        transferType: "offset",
        months: entry.months,
      });
    }
  }

  return targets;
}

/**
 * Account numbers that appear more than once within a single deduction
 * bucket (`otherLoans[]` or `offsets[]`). `null`/unset entries never count
 * as duplicates of each other or of anything else. Used to reject a
 * duplicate account server-side — the UI already prevents picking the same
 * account twice within one bucket, this is the backstop for anyone
 * bypassing it.
 */
export function findDuplicateAccountNos(
  entries: Array<{ accountNo: string | null }> | undefined,
): string[] {
  if (!entries) return [];
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const entry of entries) {
    if (!entry.accountNo) continue;
    if (seen.has(entry.accountNo)) {
      dupes.add(entry.accountNo);
    }
    seen.add(entry.accountNo);
  }
  return Array.from(dupes);
}

/**
 * Account numbers that appear in *both* buckets — targeted by an Other Loan
 * row and an Offset entry in the same computation. `findDuplicateAccountNos`
 * only catches a repeat within one bucket; a cross-bucket repeat slips past
 * both of its calls since neither array alone contains a duplicate.
 */
export function findCrossBucketAccountNos(
  otherLoans: Array<{ accountNo: string | null }> | undefined,
  offsets: Array<{ accountNo: string | null }> | undefined,
): string[] {
  const otherLoanAccounts = new Set(
    (otherLoans ?? []).map((e) => e.accountNo).filter((a): a is string => Boolean(a)),
  );
  const dupes = new Set<string>();
  for (const entry of offsets ?? []) {
    if (entry.accountNo && otherLoanAccounts.has(entry.accountNo)) {
      dupes.add(entry.accountNo);
    }
  }
  return Array.from(dupes);
}
