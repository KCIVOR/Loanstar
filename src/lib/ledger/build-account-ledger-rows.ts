export type LedgerSchedule = {
  id: string;
  dueDate: string;
  target: number;
  penalty: number;
  /** Early-settlement or origination discount on this installment, if any. */
  discount?: number;
  installmentNo?: number;
  /** Physical check encoded during LRA release, paired positionally. */
  checkNo?: string | null;
  status?: string | null;
  /** Move of Payment (see
   * docs/revision-plans/feature-move-of-payment-implementation-plan.md
   * Phase 6) — set together on every row in a moved batch. `moveSurchargeAmount`
   * is non-zero on only one row per batch (the interest-bearing one); the
   * others are 0. A batch always renders as exactly one ledger row,
   * regardless of how many underlying rows share `moveOfPaymentBatchId`. */
  movedAt?: string | null;
  moveSurchargeAmount?: number | null;
  moveOfPaymentBatchId?: string | null;
  /** Fixes Plan Phase 4b — set on the installment row(s) a Move of Payment
   * appended to the end of the schedule. Used to show "replacement check
   * needed" when no replacement PDC check has been recorded yet. */
  deferredFromMoveOfPaymentBatchId?: string | null;
};

/** Raw `amortization_schedules` row shape, straight off a Supabase `select("*")`
 * — every server-rendered ledger page (AR, Borrower) reads the DB directly, so
 * this is the one place that knows how a DB row becomes a ledger row. Adding a
 * new ledger-relevant column (the way `discount_amount` was missed across 4
 * separate hand-written mappings, 2026-08-31) means updating this function
 * once, not once per page. */
export type RawAmortizationScheduleRow = {
  id: string | number;
  installment_no?: number | string | null;
  due_date?: string | null;
  amount_due?: number | string | null;
  penalty_amount?: number | string | null;
  discount_amount?: number | string | null;
  status?: string | null;
  moved_at?: string | null;
  move_surcharge_amount?: number | string | null;
  move_of_payment_batch_id?: string | null;
  deferred_from_move_of_payment_batch_id?: string | null;
};

export function mapScheduleRowForLedger(
  row: RawAmortizationScheduleRow,
  checkNo: string | null = null,
): LedgerSchedule {
  return {
    id: String(row.id),
    dueDate: String(row.due_date ?? ""),
    target: Number(row.amount_due ?? 0),
    penalty: Number(row.penalty_amount ?? 0),
    discount: Number(row.discount_amount ?? 0),
    installmentNo: Number(row.installment_no ?? 0),
    checkNo,
    status: String(row.status ?? ""),
    movedAt: row.moved_at ?? null,
    moveSurchargeAmount:
      row.move_surcharge_amount != null ? Number(row.move_surcharge_amount) : null,
    moveOfPaymentBatchId: row.move_of_payment_batch_id ?? null,
    deferredFromMoveOfPaymentBatchId:
      row.deferred_from_move_of_payment_batch_id ?? null,
  };
}

/** The exact `amortization_schedules` columns every ledger page needs.
 * Interpolate this into every route's `.select()` instead of hand-typing the
 * list — adding a new ledger-relevant column here is the one place that
 * needs to change, not once per route (confirmed 2026-08-31: discount_amount
 * was missing from 2 of 4 routes because each hand-wrote its own list). A
 * route that needs an extra, non-ledger column (e.g. Collector's
 * `amount_paid`, used downstream by the payment form) appends it on top of
 * this constant rather than this constant growing route-specific fields. */
export const AMORTIZATION_SCHEDULE_LEDGER_COLUMNS =
  "id, installment_no, due_date, amount_due, penalty_amount, discount_amount, status, paid_at, moved_at, move_surcharge_amount, move_of_payment_batch_id, deferred_from_move_of_payment_batch_id";

export type LedgerPaymentEntry = {
  id: string;
  paymentDate: string;
  amount: number;
  referenceNo: string | null;
  channel: string;
  status: string;
  scheduleId?: string | null;
  /** Fixes Plan Phase 4 (Issue 4) — set when this posted credit is a Move
   * of Payment surcharge. Rendered as a distinct "surcharge_payment" row
   * that does NOT net against the loan balance or the credit total. */
  moveOfPaymentBatchId?: string | null;
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
  | "move_of_payment"
  | "surcharge_payment"
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
  discount: number | null;
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

/** `formatLedgerMoneyCell` already renders 0 as a dash, same as null — this
 * just normalizes an absent/undefined discount to 0 before halfUp so a
 * missing field can't slip through as NaN. */
function discountOrNull(value: number | undefined): number | null {
  const amount = Number(value) || 0;
  return amount > 0 ? halfUpMoney(amount) : null;
}

/** The installment's payable amount net of any origination/early-settlement
 * discount — what the borrower actually owes on this row. `target` used to
 * be shown gross (pre-discount) with `discount` as a separate column,
 * leaving the reader to subtract them manually; Target now already reflects
 * the discount, matching how `openingDebit`/`balance` already account for it. */
function netTarget(target: number, discount: number | undefined): number {
  return halfUpMoney(target - (Number(discount) || 0));
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
  // Fixes Plan Phase 4 (Issue 4) — a Move of Payment surcharge that has been
  // collected and posted renders as its own "surcharge_payment" row that does
  // NOT reduce the loan balance or the credit total (D2 = B). Split those
  // out here so they never flow through pushCredit.
  const surchargePaymentsByBatch = new Map<string, LedgerPaymentEntry[]>();
  for (const payment of input.payments) {
    if (payment.status !== "posted") continue;
    if (payment.moveOfPaymentBatchId) {
      const list = surchargePaymentsByBatch.get(payment.moveOfPaymentBatchId) ?? [];
      list.push(payment);
      surchargePaymentsByBatch.set(payment.moveOfPaymentBatchId, list);
      continue;
    }
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
      discount: null,
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
      target: schedule ? netTarget(schedule.target, schedule.discount) : null,
      penalty: schedule ? halfUpMoney(schedule.penalty) : null,
      discount: schedule ? discountOrNull(schedule.discount) : null,
      date: payment.paymentDate,
      referenceNo: payment.referenceNo?.trim() || null,
      status: statusLabel(schedule?.status),
      debit: null,
      credit,
      balance,
      scheduleId: schedule?.id ?? null,
    });
  }

  /** A collected Move of Payment surcharge — shown as a credit line but
   * deliberately excluded from `balance` and `creditTotal` (D2 = B): the
   * loan obligation is unchanged, the surcharge is separate. */
  function pushSurcharge(payment: LedgerPaymentEntry) {
    rows.push({
      kind: "surcharge_payment",
      key: `surcharge_payment:${payment.id}`,
      checkNo: null,
      dueDate: null,
      target: null,
      penalty: null,
      discount: null,
      date: payment.paymentDate || null,
      referenceNo: payment.referenceNo?.trim() || null,
      status: "surcharge",
      debit: null,
      credit: halfUpMoney(Number(payment.amount) || 0),
      balance,
      scheduleId: null,
    });
  }

  // Move of Payment (Phase 6, see
  // docs/revision-plans/feature-move-of-payment-implementation-plan.md) —
  // a moved batch (1 row normally, 2 for Quarterly/Two-Monthly's
  // interest+principal split) always renders as exactly one ledger row,
  // never one per underlying row. Precompute each batch's surcharge before
  // the main loop — exactly one row per batch carries a non-zero
  // moveSurchargeAmount (the interest-bearing one), so this picks it up
  // regardless of which row in the batch is encountered first below.
  const surchargeByBatch = new Map<string, number>();
  for (const schedule of input.schedules) {
    if (schedule.moveOfPaymentBatchId && schedule.moveSurchargeAmount) {
      surchargeByBatch.set(
        schedule.moveOfPaymentBatchId,
        halfUpMoney(schedule.moveSurchargeAmount),
      );
    }
  }
  const renderedBatchIds = new Set<string>();

  for (const schedule of [...input.schedules].sort(byInstallment)) {
    const credits = (creditsByScheduleId.get(schedule.id) ?? []).sort(
      byPaymentDateThenId,
    );

    if (schedule.moveOfPaymentBatchId) {
      // A row can only reach 'moved' from 'pending'/'partial'/'overdue' — if
      // it was already 'partial' with a real payment posted before being
      // moved, that payment's history must still show, never silently
      // hidden by collapsing into the batch summary row below.
      for (const payment of credits) pushCredit(payment, schedule);

      if (!renderedBatchIds.has(schedule.moveOfPaymentBatchId)) {
        renderedBatchIds.add(schedule.moveOfPaymentBatchId);
        const surcharge = surchargeByBatch.get(schedule.moveOfPaymentBatchId) ?? 0;
        const realSurcharges = (
          surchargePaymentsByBatch.get(schedule.moveOfPaymentBatchId) ?? []
        ).sort(byPaymentDateThenId);
        // The marker row shows the surcharge amount (debit === credit, nets
        // to zero) ONLY while the surcharge has not been collected as a real
        // payment. Once it has (Phase 4), the marker becomes a bare "moved"
        // status row and the money is shown on its own surcharge_payment
        // row below (D2 = B).
        const showMarkerAmounts = realSurcharges.length === 0;
        rows.push({
          kind: "move_of_payment",
          key: `move_of_payment:${schedule.moveOfPaymentBatchId}`,
          // Fixes Plan Phase 4b — show the moved installment's check with
          // its "(held)" / "(replaced)" marker (from checkNumbersByInstallmentNo).
          checkNo: schedule.checkNo?.trim() || null,
          dueDate: schedule.dueDate,
          target: null,
          penalty: null,
          discount: null,
          date: schedule.movedAt ? schedule.movedAt.slice(0, 10) : null,
          referenceNo: null,
          status: "moved",
          debit: showMarkerAmounts ? surcharge : null,
          credit: showMarkerAmounts ? surcharge : null,
          balance,
          scheduleId: null,
        });
        for (const payment of realSurcharges) pushSurcharge(payment);
      }
      continue;
    }

    if (credits.length === 0) {
      // Fixes Plan Phase 4b — the installment appended by a Move of Payment
      // has no post-dated check of its own; flag it until a replacement is
      // recorded (which then maps in positionally like any other check).
      const installmentCheckNo =
        schedule.checkNo?.trim() ||
        (schedule.deferredFromMoveOfPaymentBatchId ? "replacement needed" : null);
      rows.push({
        kind: "installment",
        key: `installment:${schedule.id}`,
        checkNo: installmentCheckNo,
        dueDate: schedule.dueDate,
        target: netTarget(schedule.target, schedule.discount),
        penalty: halfUpMoney(schedule.penalty),
        discount: discountOrNull(schedule.discount),
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

  // A surcharge whose move already reverted (deadline lapsed) has no 'moved'
  // schedule row left, so it was never rendered in the loop above — but the
  // money was still collected. Show it here.
  for (const [batchId, pays] of surchargePaymentsByBatch) {
    if (renderedBatchIds.has(batchId)) continue;
    for (const payment of [...pays].sort(byPaymentDateThenId)) {
      pushSurcharge(payment);
    }
  }

  rows.push({
    kind: "totals",
    key: "totals",
    checkNo: null,
    dueDate: null,
    target: null,
    penalty: null,
    discount: null,
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

type PostingPaymentShape = {
  payment_date?: string | null;
  reference_no?: string | null;
  channel?: string | null;
  status?: string | null;
  move_of_payment_batch_id?: string | null;
};

type PostingPaymentJoin =
  | PostingPaymentShape
  | PostingPaymentShape[]
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
      moveOfPaymentBatchId: payment?.move_of_payment_batch_id ?? null,
    };
  });
}

export type LedgerPdcCheck = {
  sort_order?: number | null;
  check_number?: string | null;
  /** Fixes Plan Phase 4b — 'active' | 'held' | 'replaced'. Absent → treated
   * as 'active' (every pre-4b check). */
  status?: string | null;
};

/**
 * LRA checks have no foreign key to installments — the only defensible link is
 * positional: `sort_order` 0 is installment 1. A check on hold for a Move of
 * Payment keeps its number but is shown with a "(held)" / "(replaced)"
 * marker (Fixes Plan Phase 4b).
 */
export function checkNumbersByInstallmentNo(
  checks: LedgerPdcCheck[],
): Map<number, string> {
  const map = new Map<number, string>();
  for (const check of checks) {
    const sortOrder = Number(check.sort_order ?? Number.NaN);
    const checkNumber = check.check_number?.trim();
    if (!Number.isFinite(sortOrder) || !checkNumber) continue;
    const status = check.status ?? "active";
    const label =
      status === "held"
        ? `${checkNumber} (held)`
        : status === "replaced"
          ? `${checkNumber} (replaced)`
          : checkNumber;
    map.set(sortOrder + 1, label);
  }
  return map;
}
