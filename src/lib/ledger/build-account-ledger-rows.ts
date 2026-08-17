export type LedgerSchedule = {
  id: string;
  dueDate: string;
  target: number;
  penalty: number;
  installmentNo?: number;
  /** Physical check encoded during LRA release, paired positionally. */
  checkNo?: string | null;
  status?: string | null;
};

export type LedgerPaymentEntry = {
  id: string;
  paymentDate: string;
  amount: number;
  referenceNo: string | null;
  channel: string;
  status: string;
  scheduleId?: string | null;
};

export type BuildAccountLedgerInput = {
  openingDebit: number;
  schedules: LedgerSchedule[];
  payments: LedgerPaymentEntry[];
};

export type AccountLedgerRowKind =
  | "opening"
  | "installment"
  | "payment"
  | "totals";

export type AccountLedgerRow = {
  kind: AccountLedgerRowKind;
  key: string;
  /** LRA-issued physical check number only — no longer falls back to the
   * payment's own reference (see referenceNo for that). */
  checkNo: string | null;
  dueDate: string | null;
  target: number | null;
  penalty: number | null;
  date: string | null;
  referenceNo: string | null;
  status: string | null;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  /** Groups "payment" rows that settled the same installment — lets the
   * table collapse repeated partial payments into one row with a breakdown. */
  scheduleId: string | null;
};

function halfUpMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function statusLabel(status: string | null | undefined): string | null {
  const label = status?.trim();
  return label ? label.toLowerCase() : null;
}

function byPaymentDateThenId(a: LedgerPaymentEntry, b: LedgerPaymentEntry) {
  const byDate = a.paymentDate.localeCompare(b.paymentDate);
  if (byDate !== 0) return byDate;
  return a.id.localeCompare(b.id);
}

function byInstallment(a: LedgerSchedule, b: LedgerSchedule) {
  const aNo = a.installmentNo ?? Number.MAX_SAFE_INTEGER;
  const bNo = b.installmentNo ?? Number.MAX_SAFE_INTEGER;
  if (aNo !== bNo) return aNo - bNo;
  return a.dueDate.localeCompare(b.dueDate);
}

/**
 * Display-only passbook rows: opening debit, one row per installment (carrying
 * its LRA check number, target, penalty and status), posted credits nested
 * under the installment they were applied to, unapplied credits last, then
 * report totals. Never mutates payments, postings or schedules.
 */
export function buildAccountLedgerRows(
  input: BuildAccountLedgerInput,
): AccountLedgerRow[] {
  const openingDebit = halfUpMoney(Math.max(0, Number(input.openingDebit) || 0));
  const scheduleById = new Map(
    input.schedules.map((schedule) => [schedule.id, schedule]),
  );

  const creditsByScheduleId = new Map<string, LedgerPaymentEntry[]>();
  const unappliedCredits: LedgerPaymentEntry[] = [];
  for (const payment of input.payments) {
    if (payment.status !== "posted") continue;
    const scheduleId = payment.scheduleId;
    if (scheduleId && scheduleById.has(scheduleId)) {
      const list = creditsByScheduleId.get(scheduleId) ?? [];
      list.push(payment);
      creditsByScheduleId.set(scheduleId, list);
      continue;
    }
    unappliedCredits.push(payment);
  }

  const rows: AccountLedgerRow[] = [
    {
      kind: "opening",
      key: "opening",
      checkNo: null,
      dueDate: null,
      target: null,
      penalty: null,
      date: null,
      referenceNo: null,
      status: null,
      debit: openingDebit,
      credit: null,
      balance: openingDebit,
      scheduleId: null,
    },
  ];

  let balance = openingDebit;
  let creditTotal = 0;

  function pushCredit(
    payment: LedgerPaymentEntry,
    schedule: LedgerSchedule | null,
  ) {
    const credit = halfUpMoney(Number(payment.amount) || 0);
    balance = halfUpMoney(Math.max(0, balance - credit));
    creditTotal = halfUpMoney(creditTotal + credit);
    rows.push({
      kind: "payment",
      key: `payment:${payment.id}`,
      checkNo: schedule?.checkNo?.trim() || null,
      dueDate: schedule?.dueDate ?? null,
      target: schedule ? halfUpMoney(schedule.target) : null,
      penalty: schedule ? halfUpMoney(schedule.penalty) : null,
      date: payment.paymentDate,
      referenceNo: payment.referenceNo?.trim() || null,
      status: statusLabel(schedule?.status),
      debit: null,
      credit,
      balance,
      scheduleId: schedule?.id ?? null,
    });
  }

  for (const schedule of [...input.schedules].sort(byInstallment)) {
    const credits = (creditsByScheduleId.get(schedule.id) ?? []).sort(
      byPaymentDateThenId,
    );
    if (credits.length === 0) {
      rows.push({
        kind: "installment",
        key: `installment:${schedule.id}`,
        checkNo: schedule.checkNo?.trim() || null,
        dueDate: schedule.dueDate,
        target: halfUpMoney(schedule.target),
        penalty: halfUpMoney(schedule.penalty),
        date: null,
        referenceNo: null,
        status: statusLabel(schedule.status),
        debit: null,
        credit: null,
        balance,
        scheduleId: schedule.id,
      });
      continue;
    }
    for (const payment of credits) pushCredit(payment, schedule);
  }

  for (const payment of [...unappliedCredits].sort(byPaymentDateThenId)) {
    pushCredit(payment, null);
  }

  rows.push({
    kind: "totals",
    key: "totals",
    checkNo: null,
    dueDate: null,
    target: null,
    penalty: null,
    date: null,
    referenceNo: null,
    status: null,
    debit: openingDebit,
    credit: creditTotal,
    balance,
    scheduleId: null,
  });

  return rows;
}

type PostingPaymentJoin =
  | {
      payment_date?: string | null;
      reference_no?: string | null;
      channel?: string | null;
      status?: string | null;
    }
  | {
      payment_date?: string | null;
      reference_no?: string | null;
      channel?: string | null;
      status?: string | null;
    }[]
  | null
  | undefined;

/** Flatten postings into ledger payment entries (one row per posting split). */
export function ledgerEntriesFromPostings(
  postings: Array<{
    id: string;
    amount: number;
    amortization_schedule_id?: string | null;
    payments?: PostingPaymentJoin;
  }>,
): LedgerPaymentEntry[] {
  return postings.map((posting) => {
    const raw = posting.payments;
    const payment = Array.isArray(raw) ? raw[0] : raw;
    return {
      id: posting.id,
      paymentDate: String(payment?.payment_date ?? ""),
      amount: Number(posting.amount ?? 0),
      referenceNo: payment?.reference_no ?? null,
      channel: String(payment?.channel ?? "payment"),
      status: String(payment?.status ?? "posted"),
      scheduleId: posting.amortization_schedule_id ?? null,
    };
  });
}

export type LedgerPdcCheck = {
  sort_order?: number | null;
  check_number?: string | null;
};

/**
 * LRA checks have no foreign key to installments — the only defensible link is
 * positional: `sort_order` 0 is installment 1.
 */
export function checkNumbersByInstallmentNo(
  checks: LedgerPdcCheck[],
): Map<number, string> {
  const map = new Map<number, string>();
  for (const check of checks) {
    const sortOrder = Number(check.sort_order ?? Number.NaN);
    const checkNumber = check.check_number?.trim();
    if (!Number.isFinite(sortOrder) || !checkNumber) continue;
    map.set(sortOrder + 1, checkNumber);
  }
  return map;
}
