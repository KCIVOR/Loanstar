export type LedgerSchedule = {
  id: string;
  dueDate: string;
  target: number;
  penalty: number;
  /** Early-settlement or origination discount on this installment, if any. */
  discount?: number;
  /** Which feature set `discount` — 'origination' | 'offset' | 'collector'
   * | null (predates this column, meaning origination or offset). Lets the
   * ledger UI label a Collector discount distinctly (feature-collector-discount-implementation-plan.md,
   * Phase 6) instead of leaving all three indistinguishable. */
  discountSource?: string | null;
  /** A Collector-approved penalty waiver — always its own column, never
   * merged into `discount` (Rule 6: that one has always meant "reduces the
   * interest side" everywhere in this codebase). */
  penaltyDiscount?: number;
  /** Penalty breakdown Phase 5b — how much of this row's `target` / `penalty`
   * was folded in by a 30-day rollover of an earlier missed installment
   * (`carriedFromInstallmentNo`). Already inside `target` / `penalty`; these
   * are for the "incl. ₱X carried from #N" note only. */
  carriedInterest?: number;
  carriedPenalty?: number;
  carriedFromInstallmentNo?: number | null;
  installmentNo?: number;
  /** Total posted to this installment so far (principal + late-fee portions
   * combined — the schedule row's own `amount_paid`). Used with each credit's
   * `penaltyPortion` to split "still owed" into principal vs penalty. */
  amountPaid?: number;
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
  amount_paid?: number | string | null;
  penalty_amount?: number | string | null;
  discount_amount?: number | string | null;
  discount_source?: string | null;
  penalty_discount_amount?: number | string | null;
  carried_interest_amount?: number | string | null;
  carried_penalty_amount?: number | string | null;
  carried_from_installment_no?: number | string | null;
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
    amountPaid: Number(row.amount_paid ?? 0),
    penalty: Number(row.penalty_amount ?? 0),
    discount: Number(row.discount_amount ?? 0),
    discountSource: row.discount_source ?? null,
    penaltyDiscount: Number(row.penalty_discount_amount ?? 0),
    carriedInterest: Number(row.carried_interest_amount ?? 0),
    carriedPenalty: Number(row.carried_penalty_amount ?? 0),
    carriedFromInstallmentNo:
      row.carried_from_installment_no != null
        ? Number(row.carried_from_installment_no)
        : null,
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
 * this constant rather than this constant growing route-specific fields.
 * `amount_paid` is here because the ledger's per-month "still owed" columns
 * need it (2026-09-09) — routes no longer append it separately. */
export const AMORTIZATION_SCHEDULE_LEDGER_COLUMNS =
  "id, installment_no, due_date, amount_due, amount_paid, penalty_amount, discount_amount, discount_source, penalty_discount_amount, carried_interest_amount, carried_penalty_amount, carried_from_installment_no, status, paid_at, moved_at, move_surcharge_amount, move_of_payment_batch_id, deferred_from_move_of_payment_batch_id";

export type LedgerPaymentEntry = {
  id: string;
  paymentDate: string;
  amount: number;
  /** How much of `amount` was recorded as late-fee money (postings.penalty_amount).
   * Lets the ledger split a credit into its principal vs penalty portions for
   * the per-month "still owed" columns. Defaults to 0. */
  penaltyPortion?: number;
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
  discountSource: string | null;
  date: string | null;
  referenceNo: string | null;
  status: string | null;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  /** Groups "payment" rows that settled the same installment — lets the
   * table collapse repeated partial payments into one row with a breakdown. */
  scheduleId: string | null;
  /** Penalty breakdown Phase 5b — the rolled-in portion of this installment's
   * Target / Penalty, and the installment it came from. `carriedFrom` null
   * when nothing was rolled in. Already included in `target` / `penalty`. */
  carriedInterest: number | null;
  carriedPenalty: number | null;
  carriedFrom: number | null;
  /** Per-month "still owed" (2026-09-09): `monthRemaining` = this installment's
   * principal not yet paid; `penaltyRemaining` = its late fee not yet paid.
   * Both null on opening / move-of-payment / surcharge rows. On the totals row
   * they hold the account-wide sums, which add up to `balance`. */
  monthRemaining: number | null;
  penaltyRemaining: number | null;
};

const NO_CARRY = { carriedInterest: null, carriedPenalty: null, carriedFrom: null } as const;
const NO_REMAIN = { monthRemaining: null, penaltyRemaining: null } as const;

function carryFields(schedule: LedgerSchedule | null | undefined) {
  const ci = Number(schedule?.carriedInterest) || 0;
  const cp = Number(schedule?.carriedPenalty) || 0;
  const from = schedule?.carriedFromInstallmentNo ?? null;
  if (ci <= 0 && cp <= 0) return NO_CARRY;
  return {
    carriedInterest: ci > 0 ? halfUpMoney(ci) : null,
    carriedPenalty: cp > 0 ? halfUpMoney(cp) : null,
    carriedFrom: from,
  };
}

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

/** The installment's penalty net of any Collector-approved waiver — same
 * convention as netTarget above, for the same reason (feature-collector-discount-implementation-plan.md,
 * Phase 6): the Penalty column showing the waived, gross figure would
 * contradict the balance next to it, which already nets the waiver out. */
function netPenalty(penalty: number, penaltyDiscount: number | undefined): number {
  return halfUpMoney(penalty - (Number(penaltyDiscount) || 0));
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
      discountSource: null,
      date: null,
      referenceNo: null,
      status: null,
      debit: openingDebit,
      credit: null,
      balance: openingDebit,
      scheduleId: null,
      ...NO_CARRY,
      ...NO_REMAIN,
    },
  ];

  let balance = openingDebit;
  let creditTotal = 0;

  // Per-month "still owed" (2026-09-09) — principal and penalty tracked
  // separately per installment. Seeded to the net Target / net Penalty the
  // first time a schedule is touched, then decremented as its credits land
  // (each credit's `penaltyPortion` is the fee slice, the rest is principal).
  // 'moved' / 'rolled' rows are excluded, same as the balance fold-in above.
  const principalRemainingBySched = new Map<string, number>();
  const penaltyRemainingBySched = new Map<string, number>();
  const remainingTrackedSchedIds = new Set<string>();

  function seedSchedRemaining(schedule: LedgerSchedule) {
    if (principalRemainingBySched.has(schedule.id)) return;
    principalRemainingBySched.set(
      schedule.id,
      Math.max(0, netTarget(schedule.target, schedule.discount)),
    );
    penaltyRemainingBySched.set(
      schedule.id,
      Math.max(0, netPenalty(schedule.penalty, schedule.penaltyDiscount)),
    );
  }

  function schedRemaining(schedule: LedgerSchedule | null | undefined) {
    if (!schedule) return NO_REMAIN;
    const st = statusLabel(schedule.status);
    if (st === "moved" || st === "rolled") return NO_REMAIN;
    seedSchedRemaining(schedule);
    remainingTrackedSchedIds.add(schedule.id);
    return {
      monthRemaining: principalRemainingBySched.get(schedule.id) ?? null,
      penaltyRemaining: penaltyRemainingBySched.get(schedule.id) ?? null,
    };
  }

  function applyCreditToRemaining(
    schedule: LedgerSchedule | null | undefined,
    payment: LedgerPaymentEntry,
  ) {
    if (!schedule) return NO_REMAIN;
    const st = statusLabel(schedule.status);
    if (st === "moved" || st === "rolled") return NO_REMAIN;
    seedSchedRemaining(schedule);
    remainingTrackedSchedIds.add(schedule.id);
    const feePortion = halfUpMoney(Number(payment.penaltyPortion) || 0);
    const amount = halfUpMoney(Number(payment.amount) || 0);
    const penLeft = halfUpMoney(
      Math.max(0, (penaltyRemainingBySched.get(schedule.id) ?? 0) - feePortion),
    );
    const prinLeft = halfUpMoney(
      Math.max(
        0,
        (principalRemainingBySched.get(schedule.id) ?? 0) -
          Math.max(0, halfUpMoney(amount - feePortion)),
      ),
    );
    penaltyRemainingBySched.set(schedule.id, penLeft);
    principalRemainingBySched.set(schedule.id, prinLeft);
    return { monthRemaining: prinLeft, penaltyRemaining: penLeft };
  }
  // Accrued late fees are debits that arise AFTER origination — `openingDebit`
  // is principal only (it comes from `total_loan`), so a penalty that has been
  // charged but not yet paid was never in the running balance, while the
  // credit that pays it flows through `pushCredit` in full. Report Total then
  // sat below the stored `outstanding_balance` (which counts `penalty_amount`)
  // by exactly the net unpaid penalty. Fold each installment's net penalty in
  // once, the first time that installment is emitted, so the ledger reconciles.
  let penaltyChargedTotal = 0;
  const penaltyChargedFor = new Set<string>();

  function applyPenaltyCharge(schedule: LedgerSchedule | null | undefined) {
    if (!schedule || penaltyChargedFor.has(schedule.id)) return;
    const status = statusLabel(schedule.status);
    // 'rolled' / 'moved' rows' obligation lives on another row — their penalty
    // (if any) must not be double-counted here. Matches the status set
    // `recompute_outstanding_balance` excludes.
    if (status === "rolled" || status === "moved") return;
    penaltyChargedFor.add(schedule.id);
    const pen = netPenalty(Number(schedule.penalty) || 0, schedule.penaltyDiscount);
    if (pen <= 0) return;
    penaltyChargedTotal = halfUpMoney(penaltyChargedTotal + pen);
    balance = halfUpMoney(balance + pen);
  }

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
      penalty: schedule
        ? netPenalty(schedule.penalty, schedule.penaltyDiscount)
        : null,
      discount: schedule ? discountOrNull(schedule.discount) : null,
      discountSource: schedule?.discountSource ?? null,
      date: payment.paymentDate,
      referenceNo: payment.referenceNo?.trim() || null,
      status: statusLabel(schedule?.status),
      debit: null,
      credit,
      balance,
      scheduleId: schedule?.id ?? null,
      ...carryFields(schedule),
      ...applyCreditToRemaining(schedule, payment),
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
      discountSource: null,
      date: payment.paymentDate || null,
      referenceNo: payment.referenceNo?.trim() || null,
      status: "surcharge",
      debit: null,
      credit: halfUpMoney(Number(payment.amount) || 0),
      balance,
      scheduleId: null,
      ...NO_CARRY,
      ...NO_REMAIN,
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

    // Fold this installment's accrued late fee into the running balance before
    // its own credits are applied against it (no-op for 0 / rolled / moved).
    applyPenaltyCharge(schedule);

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
          discountSource: null,
          date: schedule.movedAt ? schedule.movedAt.slice(0, 10) : null,
          referenceNo: null,
          status: "moved",
          debit: showMarkerAmounts ? surcharge : null,
          credit: showMarkerAmounts ? surcharge : null,
          balance,
          scheduleId: null,
          ...NO_CARRY,
          ...NO_REMAIN,
        });
        for (const payment of realSurcharges) pushSurcharge(payment);
      }
      continue;
    }

    if (credits.length === 0) {
      // Quarterly/Two-Monthly Special loans persist a $0 "principal"
      // placeholder row alongside every non-final period's real interest
      // row (see docs/quarterly-bimonthly-special-schedule-implementation-plan.md)
      // — it never represents real money, so showing it as its own ledger
      // line is just confusing (e.g. the same due date appears twice with
      // nothing on the second line). Hidden here, DISPLAY-ONLY: the row
      // still exists in amortization_schedules — needed for discount-unit
      // pairing (discount-units.ts), positional PDC check mapping
      // (checkNumbersByInstallmentNo), and rollover/aging targeting — only
      // this rendered table skips it. Guarded tightly so a row with any
      // real activity (a payment, a penalty, a discount, or a Move of
      // Payment) is never hidden — being inside this `credits.length === 0`
      // branch already guarantees no payment was ever posted to it.
      const isEmptySpecialPlaceholder =
        Number(schedule.target) === 0 &&
        Number(schedule.penalty || 0) === 0 &&
        Number(schedule.discount || 0) === 0 &&
        !schedule.moveOfPaymentBatchId &&
        !schedule.deferredFromMoveOfPaymentBatchId;
      if (isEmptySpecialPlaceholder) continue;

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
        penalty: netPenalty(schedule.penalty, schedule.penaltyDiscount),
        discount: discountOrNull(schedule.discount),
        discountSource: schedule.discountSource ?? null,
        date: null,
        referenceNo: null,
        status: statusLabel(schedule.status),
        debit: null,
        credit: null,
        balance,
        scheduleId: schedule.id,
        ...carryFields(schedule),
        ...schedRemaining(schedule),
      });
      continue;
    }
    for (const payment of credits) pushCredit(payment, schedule);
  }

  for (const payment of [...unappliedCredits].sort(byPaymentDateThenId)) {
    pushCredit(payment, null);
  }

  // Post-release discounts — a Collector-approved waiver or an Offset
  // settlement — are realized only when the installment closes, and (unlike
  // origination discounts, which `openingDebit` already nets out) were never
  // subtracted from the running balance: `balance` only ever moves down by a
  // posted credit. A fully-settled account that took a Collector/Offset
  // discount therefore left Report Total sitting at the discount amount
  // instead of ₱0. Subtract those realized discounts here so the total
  // reconciles. Origination / null-source discounts are intentionally
  // excluded (already in openingDebit).
  let realizedPostReleaseDiscount = 0;
  for (const schedule of input.schedules) {
    if (schedule.moveOfPaymentBatchId) continue;
    if (statusLabel(schedule.status) !== "paid") continue;
    if (
      schedule.discountSource === "collector" ||
      schedule.discountSource === "offset"
    ) {
      realizedPostReleaseDiscount += Number(schedule.discount) || 0;
    }
  }
  realizedPostReleaseDiscount = halfUpMoney(realizedPostReleaseDiscount);
  if (realizedPostReleaseDiscount > 0) {
    balance = halfUpMoney(Math.max(0, balance - realizedPostReleaseDiscount));
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

  let monthRemainingTotal = 0;
  let penaltyRemainingTotal = 0;
  for (const sid of remainingTrackedSchedIds) {
    monthRemainingTotal = halfUpMoney(
      monthRemainingTotal + (principalRemainingBySched.get(sid) ?? 0),
    );
    penaltyRemainingTotal = halfUpMoney(
      penaltyRemainingTotal + (penaltyRemainingBySched.get(sid) ?? 0),
    );
  }

  rows.push({
    kind: "totals",
    key: "totals",
    checkNo: null,
    dueDate: null,
    target: null,
    penalty: null,
    discount: null,
    discountSource: null,
    date: null,
    referenceNo: null,
    status: null,
    // Principal (openingDebit) + every late fee charged since. Keeps the
    // footer's debit − credit = balance identity true now that penalty
    // charges move the running balance.
    debit: halfUpMoney(openingDebit + penaltyChargedTotal),
    credit: creditTotal,
    balance,
    scheduleId: null,
    ...NO_CARRY,
    // Per-month "still owed" summed across installments — for a plain loan
    // (no origination discount, no unapplied advance) these add up to `balance`.
    monthRemaining: monthRemainingTotal,
    penaltyRemaining: penaltyRemainingTotal,
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
    penalty_amount?: number | string | null;
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
      penaltyPortion: Number(posting.penalty_amount ?? 0),
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
 * positional. A check on hold for a Move of Payment keeps its number but is
 * shown with a "(held)" / "(replaced)" marker (Fixes Plan Phase 4b).
 *
 * The position is "the Nth REAL (amount_due > 0) row in installment_no
 * order" — NOT "installment_no N" directly. Quarterly/Two-Monthly Special
 * loans persist a $0 "principal" placeholder row alongside every non-final
 * period's real interest row (see
 * docs/quarterly-bimonthly-special-schedule-implementation-plan.md), and
 * PDC checks are only ever generated for the real rows (release-service.ts's
 * buildExpectedPdcSchedule filters amountDue > 0). A naive "sort_order N ->
 * installment_no N+1" mapping assumes checks and schedule rows are the same
 * list — true for every other schedule, but false the moment a Special
 * loan's $0 rows are in the mix, silently shifting every check after the
 * first onto the wrong row (confirmed live via Committee → LRA → AR
 * end-to-end testing, 2026-09-04: a Quarterly Special loan's real checks
 * displayed against the wrong due dates in the AR ledger, with the final
 * principal check never showing up at all).
 */
export function checkNumbersByInstallmentNo(
  checks: LedgerPdcCheck[],
  scheduleRows: Array<{ installment_no: number; amount_due: number }>,
): Map<number, string> {
  const map = new Map<number, string>();
  // sort_order is each check's own, stable, originally-intended slot number
  // (0 = the 1st real row, 1 = the 2nd, ...) — it must be used as a direct
  // index into realInstallmentNos, not re-derived from a check's position in
  // some filtered/sorted array. A check with a blank number (still occupying
  // its slot, just not yet encoded) must not cause a later, valid check to
  // shift onto an earlier slot than the one it actually belongs to.
  const realInstallmentNos = scheduleRows
    .filter((row) => Number(row.amount_due) > 0)
    .sort((a, b) => a.installment_no - b.installment_no)
    .map((row) => row.installment_no);

  for (const check of checks) {
    const sortOrder = Number(check.sort_order ?? Number.NaN);
    const checkNumber = check.check_number?.trim();
    if (!Number.isFinite(sortOrder) || !checkNumber) continue;
    const installmentNo = realInstallmentNos[sortOrder];
    if (installmentNo == null) continue;
    const status = check.status ?? "active";
    const label =
      status === "held"
        ? `${checkNumber} (held)`
        : status === "replaced"
          ? `${checkNumber} (replaced)`
          : checkNumber;
    map.set(installmentNo, label);
  }
  return map;
}
