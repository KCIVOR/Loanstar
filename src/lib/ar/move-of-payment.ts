import type { SupabaseClient } from "@supabase/supabase-js";

import { writeAuditEvent } from "@/lib/audit/writer";
import { buildDiscountUnits } from "@/lib/computation/discount-units";
import { halfUp } from "@/lib/computation/money";
import {
  addCalendarMonths,
  advanceSemiMonthly,
  formatDateLocal,
} from "@/lib/computation/release-date";

/**
 * Move of Payment — see docs/revision-plans/feature-move-of-payment.md
 * (confirmed requirements) and
 * docs/revision-plans/feature-move-of-payment-implementation-plan.md
 * (this module is Phase 2, extended in Phase 5 with a read-only preview,
 * and later with manual installment selection — see the plan's addendum).
 *
 * A Collector-triggered, one-time-per-loan relief: the borrower pays one
 * month's interest as a surcharge, and a Collector-chosen open payment date
 * is marked 'moved' — no balance changes, nothing is added to any later
 * installment. If the Collector-set deadline (Phase 3) passes unpaid, the
 * moved row(s) revert and a normal penalty applies from there.
 */

export type MoveOfPaymentEligibility =
  | { ok: true; groupInstallmentIds: string[]; surchargeAmount: number }
  | { ok: false; reason: string };

export type NextDueDateGroupRow = {
  id: string;
  status: string;
  lineType: string;
};

/**
 * Pure eligibility check. Every row in `nextDueDateGroup` is expected to
 * share the account's single next open due date — length 1 for Monthly/
 * Salary/Bi-Monthly, length 2 (one 'interest' + one 'principal' row) for
 * Quarterly/Two-Monthly, since those store one real payment as two rows
 * (see implementation plan, 1.8b). Callers must never act on a single row
 * within a group independently — see implementation plan, Part 4 #5b.
 */
export function canApplyMoveOfPayment(input: {
  moveOfPaymentUsedAt: string | null;
  nextDueDateGroup: NextDueDateGroupRow[];
  // "Invoice Financing" is not a loan type in this system — it's identified
  // purely by paymentFrequency === "weekly", the same way every other
  // Invoice exclusion in this codebase gates on it.
  paymentFrequency: string | null;
  deadlineDate: string;
  asOf?: Date;
}): MoveOfPaymentEligibility {
  if (input.moveOfPaymentUsedAt) {
    return {
      ok: false,
      reason: "Move of Payment has already been used on this loan — it is a one-time relief per loan",
    };
  }

  if (input.paymentFrequency === "weekly") {
    return {
      ok: false,
      reason: "Move of Payment does not apply to Invoice (weekly) loans",
    };
  }

  if (input.nextDueDateGroup.length === 0) {
    return {
      ok: false,
      reason: "No open installment to move",
    };
  }

  const asOf = input.asOf ?? new Date();
  const deadline = new Date(`${input.deadlineDate}T00:00:00`);
  if (Number.isNaN(deadline.getTime()) || deadline <= asOf) {
    return {
      ok: false,
      reason: "Deadline must be a real date after today",
    };
  }

  const interestBearingRows = input.nextDueDateGroup.filter(
    (row) => row.lineType !== "principal",
  );
  if (interestBearingRows.length !== 1) {
    return {
      ok: false,
      reason: "Could not identify the interest-bearing row for this payment",
    };
  }

  return {
    ok: true,
    groupInstallmentIds: input.nextDueDateGroup.map((row) => row.id),
    // Real surcharge amount is filled in by loadMoveOfPaymentContext, which
    // has access to the computation's real interest split
    // (buildDiscountUnits) — this pure function only decides eligibility,
    // not the peso amount.
    surchargeAmount: 0,
  };
}

type ScheduleRow = {
  id: string;
  installment_no: number;
  due_date: string;
  status: string;
  line_type: string;
  amount_due: number;
};

type MoveOfPaymentContext =
  | {
      eligible: true;
      nextDueDate: string;
      groupRows: ScheduleRow[];
      interestBearingRow: ScheduleRow;
      surchargeAmount: number;
      movedToInstallmentNo: number | null;
      groupInstallmentIds: string[];
      // Addendum 2 (Gap 1 — schedule extension): everything applyMoveOfPayment
      // needs to append one payment cycle of new installment row(s) at the
      // end of the schedule.
      paymentFrequency: string | null;
      lastInstallmentNo: number;
      lastDueDate: string;
      // Fixes Plan Phase 4b — the release file whose PDC checks map to this
      // schedule, so applyMoveOfPayment can put the moved installment's check
      // on hold. Null if the loan has no release file.
      loanApplicationId: string;
    }
  | { eligible: false; reason: string };

/**
 * Shared by applyMoveOfPayment and listMoveOfPaymentCandidates — fetches a
 * given open due-date group and computes what a Move of Payment on it would
 * look like (surcharge amount, which rows are involved), using the exact
 * same eligibility rules and gross-basis interest computation either way.
 * `deadlineDate` only affects the deadline-sanity branch of
 * `canApplyMoveOfPayment` — listMoveOfPaymentCandidates passes a
 * placeholder, always-valid future date, since a preview happens before the
 * Collector has chosen a real one.
 */
async function loadMoveOfPaymentContext(
  supabase: SupabaseClient,
  masterlistId: string,
  deadlineDate: string,
  targetDueDate?: string,
): Promise<MoveOfPaymentContext> {
  const { data: masterlist, error: mlError } = await supabase
    .from("masterlist")
    .select("id, computation_id, move_of_payment_used_at, loan_application_id")
    .eq("id", masterlistId)
    .single();

  if (mlError || !masterlist) {
    throw new Error(mlError?.message ?? "Masterlist not found");
  }
  if (!masterlist.computation_id) {
    throw new Error("This account has no linked computation");
  }

  const { data: computation, error: compError } = await supabase
    .from("computations")
    .select(
      "principal, terms, payment_frequency, release_date, first_payment_date, due_day, total_interest, gross_total_interest",
    )
    .eq("id", masterlist.computation_id as string)
    .single();

  if (compError || !computation) {
    throw new Error(compError?.message ?? "Computation not found for this account");
  }

  const { data: openRows, error: openError } = await supabase
    .from("amortization_schedules")
    .select("id, installment_no, due_date, status, line_type, amount_due")
    .eq("masterlist_id", masterlistId)
    .in("status", ["pending", "partial", "overdue"])
    .order("due_date", { ascending: true })
    .order("installment_no", { ascending: true });

  if (openError) {
    throw new Error(openError.message);
  }

  // Addendum 2 (Gap 1): the last installment on the whole schedule
  // (any status), so applyMoveOfPayment can append one payment cycle past
  // it. Schedules are monotonic — the highest installment_no is always the
  // genuine final row, and its due_date is the schedule's last due date
  // (for Quarterly/Two-Monthly that's the final principal row, same
  // due_date as its interest sibling). 'rolled' rows never renumber, so
  // they don't affect this.
  const { data: lastRows, error: lastError } = await supabase
    .from("amortization_schedules")
    .select("installment_no, due_date")
    .eq("masterlist_id", masterlistId)
    .order("installment_no", { ascending: false })
    .limit(1);

  if (lastError) {
    throw new Error(lastError.message);
  }
  const lastRow = (lastRows ?? [])[0] as
    | { installment_no: number; due_date: string }
    | undefined;

  const rows = (openRows ?? []) as ScheduleRow[];
  // Manual selection (see implementation plan addendum, "Manual installment
  // selection"): the Collector picks which open due date to move from the
  // full list shown on the page, instead of the system always targeting the
  // earliest one. `targetDueDate` is that choice; when absent (previewing
  // the whole candidate list has no single "the" due date), the earliest
  // open one is still used as a harmless default for the eligibility-only
  // checks below.
  const selectedDueDate = targetDueDate ?? rows[0]?.due_date ?? null;
  const nextDueDateGroup: NextDueDateGroupRow[] = selectedDueDate
    ? rows
        .filter((row) => row.due_date === selectedDueDate)
        .map((row) => ({ id: row.id, status: row.status, lineType: row.line_type }))
    : [];

  const eligibility = canApplyMoveOfPayment({
    moveOfPaymentUsedAt: masterlist.move_of_payment_used_at as string | null,
    nextDueDateGroup,
    paymentFrequency: computation.payment_frequency as string | null,
    deadlineDate,
  });

  if (!eligibility.ok) {
    return { eligible: false, reason: eligibility.reason };
  }

  const groupRows = rows.filter((row) => row.due_date === selectedDueDate);
  const interestBearingRow = groupRows.find((row) => row.line_type !== "principal");
  if (!interestBearingRow) {
    // canApplyMoveOfPayment already guarantees this, but never trust a
    // narrowed-away invariant silently across two functions.
    return {
      eligible: false,
      reason: "Could not identify the interest-bearing row for this payment",
    };
  }

  // Gross basis, never net — the same distinction that caused the F10 bug
  // fixed this same week (see
  // docs/ledger-balance-consistency-fix-implementation-plan.md Phase 1).
  const grossTotalInterest =
    computation.gross_total_interest != null
      ? Number(computation.gross_total_interest)
      : Number(computation.total_interest);
  const principal = Number(computation.principal);
  const grossTotalLoan = halfUp(principal + grossTotalInterest);

  const discountUnits = buildDiscountUnits({
    paymentFrequency: computation.payment_frequency as
      | "monthly"
      | "semi_monthly"
      | "weekly"
      | "bi_monthly"
      | "quarterly"
      | "two_monthly"
      | "daily",
    terms: computation.terms as number,
    principal,
    totalInterest: grossTotalInterest,
    totalLoan: grossTotalLoan,
    releaseDate: computation.release_date as string | null,
    firstPaymentDate: computation.first_payment_date as string | null,
    dueDay: computation.due_day as number | null,
  });

  const unit = discountUnits.find((u) =>
    u.installmentNos.includes(interestBearingRow.installment_no),
  );
  if (!unit) {
    return {
      eligible: false,
      reason: `No real-interest unit found for installment #${interestBearingRow.installment_no} — cannot compute the Move of Payment surcharge`,
    };
  }
  const surchargeAmount = halfUp(unit.interestAmount / unit.installmentNos.length);

  // Informational only — the lowest installment_no in the next open
  // due-date group after the selected one. Not used by any balance/status
  // mechanics (implementation plan, Phase 2 step 4).
  const followingGroup = rows.filter(
    (row) => selectedDueDate !== null && row.due_date > selectedDueDate,
  );
  const movedToInstallmentNo = followingGroup.length > 0
    ? Math.min(...followingGroup.map((row) => row.installment_no))
    : null;

  if (!lastRow) {
    return {
      eligible: false,
      reason: "This account has no amortization schedule to extend",
    };
  }

  return {
    eligible: true,
    nextDueDate: selectedDueDate as string,
    groupRows,
    interestBearingRow,
    surchargeAmount,
    movedToInstallmentNo,
    groupInstallmentIds: eligibility.groupInstallmentIds,
    paymentFrequency: computation.payment_frequency as string | null,
    lastInstallmentNo: lastRow.installment_no,
    lastDueDate: lastRow.due_date,
    loanApplicationId: masterlist.loan_application_id as string,
  };
}

/** Loan types where a PDC check maps 1:1 to an installment row (so the
 * positional check→installment mapping holds). Quarterly/Two-Monthly store
 * one payment date as two rows and are excluded from the Phase 4b check
 * lifecycle. */
const CHECK_ONE_TO_ONE_FREQUENCIES = new Set([
  "monthly",
  "semi_monthly",
  "bi_monthly",
]);

export type MoveOfPaymentCandidate = {
  dueDate: string;
  surchargeAmount: number;
};

/**
 * Read-only — the manual-selection version of the Phase 5 preview (see
 * implementation plan addendum, "Manual installment selection"). Instead of
 * previewing only the single next open due date, this lists every open
 * due-date group on the account so the Collector can pick which one to
 * move. Account-level eligibility (already-used, Invoice exclusion) gates
 * the whole list; each candidate's surcharge is computed the exact same way
 * applyMoveOfPayment computes it for a real submission, so the numbers
 * shown can never disagree with what actually happens.
 */
export async function listMoveOfPaymentCandidates(
  supabase: SupabaseClient,
  masterlistId: string,
): Promise<
  | { eligible: true; candidates: MoveOfPaymentCandidate[] }
  | { eligible: false; reason: string }
> {
  // Same query shape (select + eq + in + two order() calls) as the one
  // loadMoveOfPaymentContext runs below, per row, for each candidate — kept
  // identical on purpose so both go through the same Supabase call pattern.
  const { data: openRows, error: openError } = await supabase
    .from("amortization_schedules")
    .select("id, installment_no, due_date, status, line_type, amount_due")
    .eq("masterlist_id", masterlistId)
    .in("status", ["pending", "partial", "overdue"])
    .order("due_date", { ascending: true })
    .order("installment_no", { ascending: true });

  if (openError) {
    throw new Error(openError.message);
  }

  const dueDates = Array.from(
    new Set(((openRows ?? []) as ScheduleRow[]).map((row) => row.due_date)),
  );

  if (dueDates.length === 0) {
    // Let loadMoveOfPaymentContext's own eligibility checks (already-used,
    // Invoice exclusion) produce the real reason, same as before there was
    // any open installment to pick from.
    const context = await loadMoveOfPaymentContext(supabase, masterlistId, "9999-12-31");
    return context.eligible
      ? { eligible: false, reason: "No open installment to move" }
      : { eligible: false, reason: context.reason };
  }

  const candidates: MoveOfPaymentCandidate[] = [];
  let accountLevelReason: string | null = null;

  for (const dueDate of dueDates) {
    const context = await loadMoveOfPaymentContext(
      supabase,
      masterlistId,
      "9999-12-31",
      dueDate,
    );
    if (!context.eligible) {
      // The first failing candidate's reason is always an account-level one
      // (already-used or Invoice exclusion) — canApplyMoveOfPayment's other
      // failure branches (empty group, bad deadline, no interest row) can't
      // trigger here since every dueDate came from a real open group and
      // the deadline placeholder is always valid.
      accountLevelReason = context.reason;
      break;
    }
    candidates.push({ dueDate, surchargeAmount: context.surchargeAmount });
  }

  if (accountLevelReason) {
    return { eligible: false, reason: accountLevelReason };
  }

  return { eligible: true, candidates };
}

/**
 * The due date one payment cycle past the schedule's current last
 * installment — where Move of Payment appends its new final row(s)
 * (Addendum 2, Gap 1). Reuses the exact same date-increment primitives the
 * schedule generators use (`addCalendarMonths` / `advanceSemiMonthly`), so
 * the appended row can't disagree with how the rest of the schedule was
 * built.
 *
 * The increment is anchored on the last installment's OWN date and carries
 * its day-of-month forward — never `computation.due_day`, which can be a
 * stale origination default (e.g. 10) while the real schedule follows
 * `first_payment_date` on a different day (e.g. the 28th). Anchoring on the
 * last row keeps the appended date aligned with the rest of the schedule,
 * the same way `generateAmortizationSchedule`'s monthly branch anchors on
 * `firstPayment` with no explicit day.
 */
function nextScheduleExtensionDueDate(
  lastDueDate: string,
  paymentFrequency: string | null,
): string {
  const last = new Date(`${lastDueDate}T00:00:00`);
  if (Number.isNaN(last.getTime())) {
    throw new Error(
      `Invalid last due date "${lastDueDate}" — cannot extend the schedule`,
    );
  }

  switch (paymentFrequency) {
    case "monthly":
      return formatDateLocal(addCalendarMonths(last, 1));
    case "semi_monthly":
      // Salary — the last row is already a genuine 15th / end-of-month date,
      // so one step through advanceSemiMonthly's alternating sequence is the
      // next real payment date.
      return advanceSemiMonthly(lastDueDate, 1);
    case "bi_monthly":
      // Every 15 days from the previous payment (matches
      // generateBiMonthlySchedule).
      last.setDate(last.getDate() + 15);
      return formatDateLocal(last);
    case "quarterly":
      return formatDateLocal(addCalendarMonths(last, 3));
    case "two_monthly":
      return formatDateLocal(addCalendarMonths(last, 2));
    default:
      // "weekly" (Invoice) is already rejected by canApplyMoveOfPayment;
      // "daily" and anything unknown have no defined one-cycle extension.
      throw new Error(
        `Move of Payment schedule extension is not supported for "${paymentFrequency ?? "unknown"}" loans`,
      );
  }
}

/**
 * Applies Move of Payment to the Collector-selected open due-date group.
 * `deadlineDate` (YYYY-MM-DD) and `dueDate` (YYYY-MM-DD, which open
 * installment to move) are both required, Collector-supplied inputs —
 * never auto-computed (implementation plan, Part 2 item 2 / Part 4 #5, and
 * the manual-selection addendum).
 *
 * Always re-fetches everything needed to decide eligibility itself — never
 * trusts a caller-supplied eligibility result, same discipline as
 * canMarkPaidOff/markPaidOff. In particular, `dueDate` is re-validated
 * against the account's real open installments here, not merely echoed
 * back from whatever the client sent.
 *
 * On success this does, in order:
 *   1. marks the selected due-date group `'moved'`;
 *   2. appends one payment cycle of new `'pending'` installment row(s) at
 *      the end of the schedule (Addendum 2 Gap 1 — the loan's maturity
 *      shifts out by one cycle), tagged with
 *      `deferred_from_move_of_payment_batch_id`;
 *   3. stamps `masterlist.move_of_payment_used_at`;
 *   4. writes one audit event.
 *
 * The surcharge (one month's interest, `move_surcharge_amount` on the moved
 * row) is NOT collected here — the Collector records it afterward through
 * the normal Record Payment flow, like any other payment. This action only
 * makes the offer take effect on the schedule (per the 2026-09-01 decision:
 * "later, separately" + "move takes effect immediately").
 */
export async function applyMoveOfPayment(
  supabase: SupabaseClient,
  masterlistId: string,
  actorId: string,
  deadlineDate: string,
  dueDate: string,
): Promise<{
  batchId: string;
  surchargeAmount: number;
  deadlineDate: string;
  groupInstallmentIds: string[];
  extensionInstallmentNos: number[];
  extensionDueDate: string;
}> {
  const context = await loadMoveOfPaymentContext(supabase, masterlistId, deadlineDate, dueDate);

  if (!context.eligible) {
    throw new Error(context.reason);
  }

  const {
    groupRows,
    interestBearingRow,
    surchargeAmount,
    movedToInstallmentNo,
    groupInstallmentIds,
    paymentFrequency,
    lastInstallmentNo,
    lastDueDate,
    loanApplicationId,
  } = context;

  const batchId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Compute the extension due date up front — if the loan's cadence has no
  // defined one-cycle extension, fail before mutating anything.
  const extensionDueDate = nextScheduleExtensionDueDate(
    lastDueDate,
    paymentFrequency,
  );

  // 1. Mark the selected due-date group 'moved'.
  for (const row of groupRows) {
    const { error: updateError } = await supabase
      .from("amortization_schedules")
      .update({
        status: "moved",
        moved_at: now,
        move_of_payment_batch_id: batchId,
        move_of_payment_deadline: deadlineDate,
        moved_to_installment_no: movedToInstallmentNo,
        move_surcharge_amount: row.id === interestBearingRow.id ? surchargeAmount : 0,
      })
      .eq("id", row.id);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  // 2. Append one payment cycle of new installment row(s) at the end of the
  //    schedule — 1 row for Monthly/Salary/Bi-Monthly, 2 (interest +
  //    principal) for Quarterly/Two-Monthly, mirroring the moved group's
  //    own shape. amount_due carries over from the moved row(s); the loan's
  //    maturity moves out by exactly one cycle. Tagged with
  //    deferred_from_move_of_payment_batch_id (never move_of_payment_batch_id
  //    — see the 20260901030000 migration and Addendum 2's validation pass).
  const extensionRows = groupRows.map((row, idx) => ({
    masterlist_id: masterlistId,
    installment_no: lastInstallmentNo + idx + 1,
    due_date: extensionDueDate,
    amount_due: row.amount_due,
    status: "pending",
    line_type: row.line_type,
    penalty_amount: 0,
    amount_paid: 0,
    discount_amount: 0,
    deferred_from_move_of_payment_batch_id: batchId,
  }));

  const { error: extensionError } = await supabase
    .from("amortization_schedules")
    .insert(extensionRows);

  if (extensionError) {
    throw new Error(extensionError.message);
  }
  const extensionInstallmentNos = extensionRows.map((r) => r.installment_no);

  // 2b. Fixes Plan Phase 4b — put the moved installment's PDC check on hold
  //     (do not present it while the move is in effect). Only for loan types
  //     where checks map 1:1 to installments; the check is the one at
  //     sort_order = installment_no - 1. Best-effort: a loan with no release
  //     file or no per-installment checks simply has nothing to hold.
  if (
    paymentFrequency &&
    CHECK_ONE_TO_ONE_FREQUENCIES.has(paymentFrequency) &&
    groupRows.length === 1
  ) {
    const { data: releaseFile } = await supabase
      .from("release_files")
      .select("id")
      .eq("loan_application_id", loanApplicationId)
      .maybeSingle();
    if (releaseFile?.id) {
      await supabase
        .from("pdc_checks")
        .update({ status: "held", move_of_payment_batch_id: batchId })
        .eq("release_file_id", releaseFile.id as string)
        .eq("sort_order", groupRows[0]!.installment_no - 1)
        .eq("status", "active");
    }
  }

  // 3. One-time-use stamp.
  const { error: mlUpdateError } = await supabase
    .from("masterlist")
    .update({ move_of_payment_used_at: now })
    .eq("id", masterlistId);

  if (mlUpdateError) {
    throw new Error(mlUpdateError.message);
  }

  // 4. Audit.
  await writeAuditEvent({
    actorId,
    moduleSlug: "collection",
    action: "execute_trigger",
    entityType: "masterlist",
    entityId: masterlistId,
    afterData: {
      trigger: "move_of_payment",
      batchId,
      deadlineDate,
      surchargeAmount,
      groupInstallmentIds,
      extensionDueDate,
      extensionInstallmentNos,
    },
  });

  return {
    batchId,
    surchargeAmount,
    deadlineDate,
    groupInstallmentIds,
    extensionInstallmentNos,
    extensionDueDate,
  };
}

/**
 * Records the one-month-interest surcharge for an in-effect Move of Payment
 * as a real `payments` row, tagged with the move's batch id (Fixes Plan
 * Phase 2, Issue 3). This is a SEPARATE follow-up action — `applyMoveOfPayment`
 * (the offer) stays payment-free (2026-09-01 decision). Does not touch
 * amortization_schedules or `masterlist.move_of_payment_used_at`.
 *
 * The amount is not caller-supplied: it is read from the moved row's stored
 * `move_surcharge_amount`, so it can never disagree with what the offer
 * computed. Rejects if there is no active move on the account, or if the
 * surcharge for the current move was already recorded.
 */
export async function recordMoveOfPaymentSurcharge(
  supabase: SupabaseClient,
  masterlistId: string,
  actorId: string,
  input: {
    referenceNo: string;
    channel: "bank_deposit" | "check" | "pos_cash";
    paymentDate: string;
  },
): Promise<{ paymentId: string; batchId: string; amount: number }> {
  const { data: movedRows, error: movedError } = await supabase
    .from("amortization_schedules")
    .select("move_of_payment_batch_id, move_surcharge_amount")
    .eq("masterlist_id", masterlistId)
    .eq("status", "moved")
    .not("move_of_payment_batch_id", "is", null);

  if (movedError) {
    throw new Error(movedError.message);
  }
  if (!movedRows || movedRows.length === 0) {
    throw new Error("This account has no active Move of Payment to record a surcharge for");
  }

  const batchId = movedRows[0]!.move_of_payment_batch_id as string;
  // Exactly one row per batch carries a non-zero surcharge (the
  // interest-bearing one); the rest are 0. Sum is safe and picks it up
  // regardless of row order.
  const amount = halfUp(
    movedRows.reduce((sum, row) => sum + Number(row.move_surcharge_amount ?? 0), 0),
  );
  if (amount <= 0) {
    throw new Error("The moved installment has no surcharge amount on file");
  }

  const { data: existing, error: existingError } = await supabase
    .from("payments")
    .select("id")
    .eq("move_of_payment_batch_id", batchId)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }
  if (existing) {
    throw new Error("The surcharge for this Move of Payment has already been recorded");
  }

  const { data: masterlist, error: mlError } = await supabase
    .from("masterlist")
    .select("loan_application_id, borrower_id")
    .eq("id", masterlistId)
    .single();

  if (mlError || !masterlist) {
    throw new Error(mlError?.message ?? "Masterlist not found");
  }

  const now = new Date().toISOString();
  const { data: paymentRow, error: paymentError } = await supabase
    .from("payments")
    .insert({
      masterlist_id: masterlistId,
      loan_application_id: masterlist.loan_application_id,
      borrower_id: masterlist.borrower_id,
      reference_no: input.referenceNo,
      payment_date: input.paymentDate,
      amount,
      channel: input.channel,
      status: "confirmed",
      uploaded_by: actorId,
      reviewed_by: actorId,
      reviewed_at: now,
      notes: "Move of Payment surcharge",
      move_of_payment_batch_id: batchId,
    })
    .select("id")
    .single();

  if (paymentError || !paymentRow) {
    throw new Error(
      paymentError?.message ?? "Failed to record the Move of Payment surcharge payment",
    );
  }
  const paymentId = paymentRow.id as string;

  await writeAuditEvent({
    actorId,
    moduleSlug: "collection",
    action: "create",
    entityType: "payment",
    entityId: paymentId,
    afterData: {
      trigger: "move_of_payment_surcharge",
      batchId,
      amount,
      channel: input.channel,
    },
  });

  return { paymentId, batchId, amount };
}

/**
 * Records a replacement PDC check for the installment appended by an
 * in-effect Move of Payment (Fixes Plan Phase 4b, Issue 7). Inserts a new
 * `pdc_checks` row that maps positionally to the extended installment, and
 * marks the held original check `replaced`. Both rows carry the move's
 * `move_of_payment_batch_id`, so the deadline-revert cleans them up.
 *
 * Only valid when the move put a check on hold (the loan type maps checks
 * 1:1 to installments). Rejects if there is no held check for the current
 * move, or if a replacement was already recorded.
 */
export async function recordReplacementCheck(
  supabase: SupabaseClient,
  masterlistId: string,
  actorId: string,
  input: { checkNumber: string; checkDate: string; bankName?: string | null },
): Promise<{ replacementCheckId: string; batchId: string }> {
  // The account's active move + its extension row.
  const { data: movedRows, error: movedError } = await supabase
    .from("amortization_schedules")
    .select("move_of_payment_batch_id")
    .eq("masterlist_id", masterlistId)
    .eq("status", "moved")
    .not("move_of_payment_batch_id", "is", null);

  if (movedError) throw new Error(movedError.message);
  if (!movedRows || movedRows.length === 0) {
    throw new Error("This account has no active Move of Payment");
  }
  const batchId = movedRows[0]!.move_of_payment_batch_id as string;

  const { data: extensionRow, error: extError } = await supabase
    .from("amortization_schedules")
    .select("installment_no, due_date, amount_due")
    .eq("masterlist_id", masterlistId)
    .eq("deferred_from_move_of_payment_batch_id", batchId)
    .order("installment_no", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (extError) throw new Error(extError.message);
  if (!extensionRow) {
    throw new Error("No extended installment found for this Move of Payment");
  }

  const { data: masterlist, error: mlError } = await supabase
    .from("masterlist")
    .select("loan_application_id")
    .eq("id", masterlistId)
    .single();
  if (mlError || !masterlist) {
    throw new Error(mlError?.message ?? "Masterlist not found");
  }

  const { data: releaseFile } = await supabase
    .from("release_files")
    .select("id")
    .eq("loan_application_id", masterlist.loan_application_id as string)
    .maybeSingle();
  if (!releaseFile?.id) {
    throw new Error("This loan has no release file — no PDC checks to replace");
  }
  const releaseFileId = releaseFile.id as string;

  // The held original for this move.
  const { data: heldCheck, error: heldError } = await supabase
    .from("pdc_checks")
    .select("id, status, sort_order, bank_name")
    .eq("release_file_id", releaseFileId)
    .eq("move_of_payment_batch_id", batchId)
    .in("status", ["held", "replaced"])
    .limit(1)
    .maybeSingle();

  if (heldError) throw new Error(heldError.message);
  if (!heldCheck) {
    throw new Error(
      "This Move of Payment did not put a check on hold — this loan type may not track per-installment checks",
    );
  }
  if (heldCheck.status === "replaced") {
    throw new Error("A replacement check for this Move of Payment has already been recorded");
  }

  // New check maps positionally to the extended installment
  // (sort_order = installment_no - 1).
  const replacementSortOrder = (extensionRow.installment_no as number) - 1;

  const { data: inserted, error: insertError } = await supabase
    .from("pdc_checks")
    .insert({
      release_file_id: releaseFileId,
      check_number: input.checkNumber,
      amount: extensionRow.amount_due,
      check_date: input.checkDate,
      // pdc_checks.bank_name is NOT NULL — fall back to the held original's
      // bank (a replacement is normally from the same bank).
      bank_name:
        input.bankName?.trim() || (heldCheck.bank_name as string | null) || "",
      sort_order: replacementSortOrder,
      status: "active",
      move_of_payment_batch_id: batchId,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "Failed to record the replacement check");
  }
  const replacementCheckId = inserted.id as string;

  const { error: markError } = await supabase
    .from("pdc_checks")
    .update({ status: "replaced", replaced_by_check_id: replacementCheckId })
    .eq("id", heldCheck.id as string);

  if (markError) {
    throw new Error(markError.message);
  }

  await writeAuditEvent({
    actorId,
    moduleSlug: "collection",
    action: "create",
    entityType: "pdc_check",
    entityId: replacementCheckId,
    afterData: {
      trigger: "move_of_payment_replacement_check",
      batchId,
      replacedCheckId: heldCheck.id,
      checkNumber: input.checkNumber,
      checkDate: input.checkDate,
    },
  });

  return { replacementCheckId, batchId };
}
