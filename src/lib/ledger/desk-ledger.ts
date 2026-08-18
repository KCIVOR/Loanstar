import {
  buildAccountLedgerRows,
  checkNumbersByInstallmentNo,
  ledgerEntriesFromPostings,
  type AccountLedgerRow,
  type LedgerPdcCheck,
} from "./build-account-ledger-rows";

export type DeskLedgerSchedule = {
  id: string;
  installmentNo: number;
  dueDate: string;
  amountDue: number;
  penaltyAmount: number;
  status: string;
};

export type DeskLedgerPosting = Parameters<
  typeof ledgerEntriesFromPostings
>[0][number];

export type BuildDeskLedgerInput = {
  totalLoan: number;
  schedules: DeskLedgerSchedule[];
  postings: DeskLedgerPosting[];
  pdcChecks: LedgerPdcCheck[];
};

/**
 * Collector and Remedial share the AR/borrower ledger shape: credits come from
 * `postings`, not raw payment rows, so each posted split lands on the
 * installment it settled instead of trailing the table as an unapplied credit.
 */
export function buildDeskLedgerRows({
  totalLoan,
  schedules,
  postings,
  pdcChecks,
}: BuildDeskLedgerInput): AccountLedgerRow[] {
  const checkNoByInstallment = checkNumbersByInstallmentNo(pdcChecks);
  const scheduleTotal = schedules.reduce(
    (sum, row) => sum + Number(row.amountDue ?? 0),
    0,
  );

  return buildAccountLedgerRows({
    openingDebit: totalLoan > 0 ? totalLoan : scheduleTotal,
    schedules: schedules.map((row) => ({
      id: row.id,
      dueDate: row.dueDate,
      target: Number(row.amountDue ?? 0),
      penalty: Number(row.penaltyAmount ?? 0),
      installmentNo: row.installmentNo,
      checkNo: checkNoByInstallment.get(row.installmentNo) ?? null,
      status: row.status,
    })),
    payments: ledgerEntriesFromPostings(postings),
  });
}
