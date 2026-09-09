import type { SupabaseClient } from "@supabase/supabase-js";

import { resolvePenaltyRate } from "@/lib/ar/penalty-rate";
import { canWriteOffAccountRounding } from "@/lib/ar/rounding-writeoff";
import {
  calculatePenaltyAmount,
  computeAgingBucket,
  daysPastDue,
  DEFAULT_AGING_THRESHOLDS,
  type AgingThresholds,
} from "@/lib/ar/schedule";
import {
  findOverAllocatedInstallments,
  loadDcrAllocationsWithMasterlist,
  loadPendingAllocationsForAccount,
} from "@/lib/ar/duplicate-dcr";
import { isActiveDcrStatus } from "@/lib/collector/desk";
import { halfUp, netInstallmentDue } from "@/lib/computation/money";
import { createServiceClient } from "@/lib/supabase/server";

export type OpenInstallment = {
  id: string;
  installmentNo: number;
  amountDue: number;
  penaltyAmount: number;
  amountPaid: number;
  /** Origination or early-settlement discount on this installment, if any. */
  discountAmount?: number;
  status: "pending" | "partial" | "overdue";
};

export type AllocationLine = {
  amortizationScheduleId: string | null;
  amount: number;
};

/**
 * Fill oldest-open-installment-first up to each row's remaining due; trailing
 * advance line only when money remains after all open installments are covered.
 */
export function computeAutoAllocation(
  amount: number,
  openInstallments: OpenInstallment[],
): AllocationLine[] {
  let remaining = halfUp(amount);
  const lines: AllocationLine[] = [];

  for (const inst of openInstallments) {
    if (remaining <= 0) break;

    const remainingDue = netInstallmentDue({
      amountDue: inst.amountDue,
      discountAmount: inst.discountAmount,
      penaltyAmount: inst.penaltyAmount,
      amountPaid: inst.amountPaid,
    });
    if (remainingDue <= 0) continue;

    const applied = halfUp(Math.min(remaining, remainingDue));
    if (applied > 0) {
      lines.push({ amortizationScheduleId: inst.id, amount: applied });
      remaining = halfUp(remaining - applied);
    }
  }

  if (remaining > 0) {
    lines.push({ amortizationScheduleId: null, amount: remaining });
  }

  return lines;
}

/** Exported so `/api/collector/dcr/allocation-preview` can reuse the exact
 * same fetch instead of hand-rolling a second copy of this query (that
 * second copy was missing discount_amount before 2026-08-31). */
export async function fetchOpenInstallments(
  supabase: SupabaseClient,
  masterlistId: string,
): Promise<OpenInstallment[]> {
  const { data, error } = await supabase
    .from("amortization_schedules")
    .select(
      "id, installment_no, amount_due, penalty_amount, discount_amount, amount_paid, status",
    )
    .eq("masterlist_id", masterlistId)
    .in("status", ["pending", "partial", "overdue"])
    .order("installment_no");

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    installmentNo: row.installment_no as number,
    amountDue: Number(row.amount_due),
    penaltyAmount: Number(row.penalty_amount ?? 0),
    discountAmount: Number(row.discount_amount ?? 0),
    amountPaid: Number(row.amount_paid),
    status: row.status as OpenInstallment["status"],
  }));
}

/**
 * Interest portion per installment isn't stored anywhere (amount_due is
 * principal+interest blended) — derive it from the loan's own active
 * computation, same even-split convention (totalInterest ÷ terms, halved
 * again for semi-monthly) already used by the Offset discount's
 * `activeLoans` path in `computation/route.ts`. Centralized here
 * (feature-collector-discount-implementation-plan.md, Phase 2/5) so the
 * DCRR allocation-preview route and the server-side discount-amount
 * re-validation both call the exact same formula rather than each keeping
 * their own copy — the same lesson `fetchOpenInstallments` above already
 * exists to teach.
 */
export async function deriveInterestPerRow(
  supabase: SupabaseClient,
  masterlistId: string,
): Promise<number> {
  const { data: masterlistRow } = await supabase
    .from("masterlist")
    .select("computation_id")
    .eq("id", masterlistId)
    .single();

  const computationId = masterlistRow?.computation_id as string | null;
  if (!computationId) return 0;

  const { data: computationRow } = await supabase
    .from("computations")
    .select("total_interest, terms, payment_frequency")
    .eq("id", computationId)
    .single();

  if (!computationRow) return 0;

  const terms = Number(computationRow.terms) || 1;
  const interestPerMonth = halfUp(Number(computationRow.total_interest) / terms);
  return computationRow.payment_frequency === "semi_monthly"
    ? halfUp(interestPerMonth / 2)
    : interestPerMonth;
}

/**
 * The account's true outstanding balance, derived fresh from the rows —
 * never accumulated. Sum of net-still-owed (amount_due − discount_amount +
 * penalty_amount − amount_paid, floored at 0) across every installment not
 * already 'paid' or 'rolled'.
 *
 * Foundation only — not yet called from any balance-mutating path (that's
 * Phase 4). See docs/ledger-balance-consistency-fix-implementation-plan.md
 * Phase 3, including the F7 decision this function encodes: penalty IS
 * included, because that matches what the row ledger has always shown as
 * "still owed" — excluding it would mean this derived balance still
 * disagrees with the ledger the borrower sees. A SQL twin,
 * `public.recompute_outstanding_balance`, mirrors this exact formula for
 * callers that can't invoke TypeScript (`post_internal_transfer`).
 */
export async function recomputeOutstandingBalance(
  supabase: SupabaseClient,
  masterlistId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("amortization_schedules")
    .select(
      "amount_due, discount_amount, penalty_amount, penalty_discount_amount, amount_paid, status",
    )
    .eq("masterlist_id", masterlistId)
    // 'moved' rows are frozen like 'rolled' — a Move of Payment defers the
    // obligation onto an appended extension row, so counting the moved row
    // too would double-count one installment (Fixes Plan Phase 1, Issue 1).
    .not("status", "in", "(paid,rolled,moved)");

  if (error) throw new Error(error.message);

  return halfUp(
    (data ?? []).reduce(
      (sum, row) =>
        sum +
        netInstallmentDue({
          amountDue: Number(row.amount_due),
          discountAmount: row.discount_amount as number | null,
          penaltyAmount: row.penalty_amount as number | null,
          // Fifth copy of this formula, found unused ("Foundation only")
          // while implementing feature-collector-discount-implementation-plan.md,
          // Phase 5 — fixed for the same reason as the other four, even
          // though nothing calls this yet: a future caller shouldn't
          // inherit a stale copy that silently drops a Collector penalty
          // waiver.
          penaltyDiscountAmount: row.penalty_discount_amount as number | null,
          amountPaid: row.amount_paid as number | null,
        }),
      0,
    ),
  );
}

/**
 * Whether every installment on this account is already 'paid' or 'rolled' —
 * the row-level half of "is this account actually done?" (F8, see
 * docs/ledger-balance-consistency-fix-implementation-plan.md Phase 6).
 *
 * A derived balance of ₱0.00 (recomputeOutstandingBalance) is NOT the same
 * thing: a row can net to ₱0.00 (e.g. penalty exactly offsetting an
 * over-credit) while still sitting at 'pending'/'partial'/'overdue' — that
 * row is not actually settled, it just happens to owe nothing right now.
 * `account_status` must only ever become "paid" when both are true:
 * newBalance <= 0 AND every row has genuinely reached 'paid'/'rolled'.
 */
export async function isAccountFullySettled(
  supabase: SupabaseClient,
  masterlistId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("amortization_schedules")
    .select("id")
    .eq("masterlist_id", masterlistId)
    .not("status", "in", "(paid,rolled)")
    .limit(1);

  if (error) throw new Error(error.message);

  return (data ?? []).length === 0;
}

async function validateAllocationLines(
  supabase: SupabaseClient,
  masterlistId: string,
  paymentAmount: number,
  allocations: AllocationLine[],
): Promise<void> {
  const total = halfUp(
    allocations.reduce((sum, line) => sum + line.amount, 0),
  );
  const expected = halfUp(paymentAmount);
  if (total !== expected) {
    throw new Error(
      `Allocation total ${total.toFixed(2)} does not match the payment amount ${expected.toFixed(2)} — adjust the installment split before adding to the DCRR`,
    );
  }

  const scheduleIds = allocations
    .map((line) => line.amortizationScheduleId)
    .filter((id): id is string => id !== null);

  if (scheduleIds.length === 0) return;

  const { data: schedules, error } = await supabase
    .from("amortization_schedules")
    .select("id, masterlist_id, status")
    .in("id", scheduleIds);

  if (error) throw new Error(error.message);

  const byId = new Map((schedules ?? []).map((row) => [row.id as string, row]));

  for (const scheduleId of scheduleIds) {
    const schedule = byId.get(scheduleId);
    if (!schedule || schedule.masterlist_id !== masterlistId) {
      throw new Error(
        `Installment ${scheduleId} does not belong to this loan account`,
      );
    }
    if (schedule.status === "rolled" || schedule.status === "paid") {
      throw new Error(
        `Installment ${scheduleId} is not available for allocation (${schedule.status as string})`,
      );
    }
  }
}

function parseRate(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/**
 * Reads Seafarer vs SME penalty rates and selects by masterlist.segment.
 * Throws if segment is NULL/unknown — never silently uses the Seafarer rate.
 */
export async function getPenaltyRate(
  supabase: SupabaseClient,
  segment: string | null | undefined,
): Promise<number> {
  const { data } = await supabase
    .from("config_settings")
    .select("key, value")
    .in("key", ["penalty_rate", "penalty_rate_sme", "penalty_rate_individual"]);

  let seafarer = 0.05;
  let sme = 0.05;
  let individual = 0.05;
  for (const row of data ?? []) {
    if (row.key === "penalty_rate") seafarer = parseRate(row.value, 0.05);
    if (row.key === "penalty_rate_sme") sme = parseRate(row.value, 0.05);
    if (row.key === "penalty_rate_individual")
      individual = parseRate(row.value, 0.05);
  }

  return resolvePenaltyRate(segment, { seafarer, sme, individual });
}

async function getAgingThresholds(
  supabase: SupabaseClient,
): Promise<AgingThresholds> {
  const { data } = await supabase
    .from("config_settings")
    .select("value")
    .eq("key", "aging_thresholds")
    .maybeSingle();

  const raw = data?.value as Record<string, unknown> | undefined;
  if (!raw) return DEFAULT_AGING_THRESHOLDS;

  return {
    t30: Number(raw["30"] ?? DEFAULT_AGING_THRESHOLDS.t30),
    t60: Number(raw["60"] ?? DEFAULT_AGING_THRESHOLDS.t60),
    t90: Number(raw["90"] ?? DEFAULT_AGING_THRESHOLDS.t90),
  };
}

/**
 * Maximum remaining balance (₱) AR can write off as a rounding difference.
 * Falls back to 1.00 when the config row is missing or unparsable.
 */
export async function getRoundingWriteoffThreshold(
  supabase: SupabaseClient,
): Promise<number> {
  const { data } = await supabase
    .from("config_settings")
    .select("value")
    .eq("key", "rounding_writeoff_threshold")
    .maybeSingle();

  return parseRate(data?.value, 1.0);
}

/**
 * Closes a small installment remainder as a logged rounding write-off.
 * Only allowed when remaining due is positive and within the configured threshold.
 */
export async function writeOffRoundingDifference(
  supabase: SupabaseClient,
  masterlistId: string,
  amortizationScheduleId: string,
  actorId: string,
  notes?: string,
) {
  const { data: schedule, error: scheduleError } = await supabase
    .from("amortization_schedules")
    .select(
      "id, masterlist_id, amount_due, penalty_amount, discount_amount, amount_paid, status",
    )
    .eq("id", amortizationScheduleId)
    .maybeSingle();

  if (scheduleError) throw new Error(scheduleError.message);
  if (!schedule || schedule.masterlist_id !== masterlistId) {
    throw new Error("Amortization schedule not found for this account");
  }

  const status = schedule.status as string;
  if (status === "paid" || status === "rolled") {
    throw new Error(
      `Installment cannot be written off — status is already ${status}`,
    );
  }

  const amountDue = Number(schedule.amount_due);
  const penaltyAmount = Number(schedule.penalty_amount ?? 0);
  const amountPaid = Number(schedule.amount_paid);
  // Net of discount — a discounted installment's real remaining balance is
  // smaller than gross amount_due (fixed 2026-08-31, see
  // docs/payment-flow-discount-audit-and-fix-plan.md).
  const remainingDue = netInstallmentDue({
    amountDue,
    discountAmount: schedule.discount_amount,
    penaltyAmount,
    amountPaid,
  });

  if (remainingDue <= 0) {
    throw new Error(
      "Nothing to write off — installment is already fully paid",
    );
  }

  const threshold = await getRoundingWriteoffThreshold(supabase);
  if (remainingDue > threshold) {
    throw new Error(
      `Remaining balance ₱${remainingDue.toFixed(2)} exceeds the rounding write-off limit of ₱${threshold.toFixed(2)} — post a normal payment instead`,
    );
  }

  const now = new Date().toISOString();
  const totalDue = netInstallmentDue({
    amountDue,
    discountAmount: schedule.discount_amount,
    penaltyAmount,
  });

  const { error: insertError } = await supabase
    .from("rounding_writeoffs")
    .insert({
      masterlist_id: masterlistId,
      amortization_schedule_id: amortizationScheduleId,
      amount: remainingDue,
      performed_by: actorId,
      performed_at: now,
      notes: notes ?? null,
    });

  if (insertError) throw new Error(insertError.message);

  const { error: scheduleUpdateError } = await supabase
    .from("amortization_schedules")
    .update({
      amount_paid: totalDue,
      status: "paid",
      paid_at: now,
    })
    .eq("id", amortizationScheduleId);

  if (scheduleUpdateError) throw new Error(scheduleUpdateError.message);

  // Derived fresh from the rows (Phase 4, see
  // docs/ledger-balance-consistency-fix-implementation-plan.md) — the row
  // above is already "paid", so this naturally excludes it.
  const newBalance = await recomputeOutstandingBalance(supabase, masterlistId);
  // A ₱0.00 derived balance does NOT by itself mean the account is done —
  // a row can net to ₱0.00 while still sitting open (F8, see Phase 6 of the
  // same plan). account_status only becomes "paid" when every row has
  // genuinely reached 'paid'/'rolled' too.
  const fullySettled = await isAccountFullySettled(supabase, masterlistId);

  const { error: mlUpdateError } = await supabase
    .from("masterlist")
    .update({
      outstanding_balance: newBalance,
      account_status: newBalance <= 0 && fullySettled ? "paid" : "active",
    })
    .eq("id", masterlistId);

  if (mlUpdateError) throw new Error(mlUpdateError.message);

  return {
    amount: remainingDue,
    scheduleId: amortizationScheduleId,
    writtenOffAt: now,
  };
}

/**
 * Closes an account leftover after every installment is already paid.
 * Used when total loan and monthly × terms differ by a rounding centavo.
 */
export async function writeOffAccountRoundingDifference(
  supabase: SupabaseClient,
  masterlistId: string,
  actorId: string,
  notes?: string,
) {
  const { data: record, error: mlError } = await supabase
    .from("masterlist")
    .select("id, outstanding_balance, amortization_schedules ( status )")
    .eq("id", masterlistId)
    .single();

  if (mlError || !record) {
    throw new Error(mlError?.message ?? "Masterlist record not found");
  }

  const schedulesRaw = record.amortization_schedules;
  const schedules = Array.isArray(schedulesRaw) ? schedulesRaw : [];
  const scheduleStatuses = schedules.map((row) =>
    String((row as { status?: string }).status ?? ""),
  );

  const threshold = await getRoundingWriteoffThreshold(supabase);
  const eligibility = canWriteOffAccountRounding({
    outstandingBalance: Number(record.outstanding_balance),
    threshold,
    scheduleStatuses,
  });

  if (!eligibility.ok) {
    throw new Error(eligibility.reason);
  }

  const now = new Date().toISOString();

  const { error: insertError } = await supabase
    .from("rounding_writeoffs")
    .insert({
      masterlist_id: masterlistId,
      amortization_schedule_id: null,
      amount: eligibility.amount,
      performed_by: actorId,
      performed_at: now,
      notes: notes ?? null,
    });

  if (insertError) throw new Error(insertError.message);

  // Derived fresh from the rows (Phase 4, see
  // docs/ledger-balance-consistency-fix-implementation-plan.md) — eligibility
  // above already required every row paid/rolled, so this is 0 by construction.
  const newBalance = await recomputeOutstandingBalance(supabase, masterlistId);
  // Same row-level check as writeOffRoundingDifference (F8, Phase 6) — a
  // no-op here in practice, since canWriteOffAccountRounding's eligibility
  // check above already required every row paid/rolled, but kept for the
  // same reason every other balance-mutating site now has it: account_status
  // must never be derived from the balance number alone.
  const fullySettled = await isAccountFullySettled(supabase, masterlistId);

  const { error: mlUpdateError } = await supabase
    .from("masterlist")
    .update({
      outstanding_balance: newBalance,
      account_status: newBalance <= 0 && fullySettled ? "paid" : "active",
    })
    .eq("id", masterlistId);

  if (mlUpdateError) throw new Error(mlUpdateError.message);

  return {
    amount: eligibility.amount,
    scheduleId: null as string | null,
    writtenOffAt: now,
  };
}

export async function refreshMasterlistAging(
  supabase: SupabaseClient,
  masterlistId: string,
  asOf = new Date(),
) {
  const { data: masterlistRow, error: mlReadError } = await supabase
    .from("masterlist")
    .select("segment, total_loan, outstanding_balance, loan_application_id")
    .eq("id", masterlistId)
    .single();

  if (mlReadError || !masterlistRow) {
    throw new Error(
      mlReadError?.message ?? `Masterlist ${masterlistId} not found`,
    );
  }

  // Move of Payment revert (see
  // docs/revision-plans/feature-move-of-payment-implementation-plan.md
  // Phase 3) — a clearly separate, standalone block, run BEFORE the
  // schedules SELECT below so the existing, untouched overdue/penalty logic
  // (unmodified by this feature) naturally sees any just-reverted row's
  // fresh status on this same pass, exactly like the requirements doc
  // describes ("no new penalty logic needed"). Every row sharing a
  // move_of_payment_batch_id always carries the same
  // move_of_payment_deadline (set together in applyMoveOfPayment), so
  // filtering rows directly is equivalent to grouping by batch — reverting
  // one automatically reverts the whole batch, never half of it (Part 4 #5b
  // of the plan).
  const { data: movedRows } = await supabase
    .from("amortization_schedules")
    .select("id, move_of_payment_deadline, move_of_payment_batch_id")
    .eq("masterlist_id", masterlistId)
    .eq("status", "moved");

  const expiredMoved = (movedRows ?? []).filter(
    (row) =>
      row.move_of_payment_deadline &&
      daysPastDue(row.move_of_payment_deadline as string, asOf) > 0,
  );
  const expiredMovedIds = expiredMoved.map((row) => row.id as string);
  const expiredBatchIds = [
    ...new Set(
      expiredMoved
        .map((row) => row.move_of_payment_batch_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (expiredMovedIds.length > 0) {
    await supabase
      .from("amortization_schedules")
      .update({
        status: "pending",
        moved_at: null,
        moved_to_installment_no: null,
        move_surcharge_amount: null,
        move_of_payment_deadline: null,
        move_of_payment_batch_id: null,
      })
      .in("id", expiredMovedIds);
  }

  // Addendum 2 (Gap 1): a lapsed batch also un-does its schedule extension —
  // delete the 'pending' installment row(s) it appended at the end of the
  // schedule (tagged with deferred_from_move_of_payment_batch_id, never
  // move_of_payment_batch_id). Skip any that already carry a payment
  // (defensive — the appended row is the new last installment, so an earlier
  // deadline lapsing before it is paid is the normal case, but never delete
  // real money). The surcharge payment itself is deliberately left alone —
  // once AR posts it, it stands as an unapplied credit on the account.
  if (expiredBatchIds.length > 0) {
    await supabase
      .from("amortization_schedules")
      .delete()
      .eq("masterlist_id", masterlistId)
      .eq("amount_paid", 0)
      .in("deferred_from_move_of_payment_batch_id", expiredBatchIds);

    // Fixes Plan Phase 4b — a lapsed batch also un-does its PDC check
    // lifecycle: drop any replacement check recorded for the (now-deleted)
    // extension row, and restore the held/replaced original check(s) to
    // 'active'. Best-effort — a loan with no release file / no per-installment
    // checks simply has nothing to update.
    const { data: releaseFile } = await supabase
      .from("release_files")
      .select("id")
      .eq("loan_application_id", masterlistRow.loan_application_id as string)
      .maybeSingle();
    const releaseFileId = releaseFile?.id as string | undefined;
    if (releaseFileId) {
      // Restore held/replaced originals FIRST — this clears
      // replaced_by_check_id so the self-FK no longer points at the
      // replacement rows the next statement deletes.
      await supabase
        .from("pdc_checks")
        .update({
          status: "active",
          move_of_payment_batch_id: null,
          replaced_by_check_id: null,
        })
        .eq("release_file_id", releaseFileId)
        .in("status", ["held", "replaced"])
        .in("move_of_payment_batch_id", expiredBatchIds);
      await supabase
        .from("pdc_checks")
        .delete()
        .eq("release_file_id", releaseFileId)
        .eq("status", "active")
        .in("move_of_payment_batch_id", expiredBatchIds);
    }
  }

  const { data: schedules } = await supabase
    .from("amortization_schedules")
    .select(
      "id, installment_no, due_date, status, amount_due, amount_paid, penalty_amount, rolled_at, discount_amount, penalty_discount_amount",
    )
    .eq("masterlist_id", masterlistId)
    .neq("status", "paid")
    .order("installment_no");

  const thresholds = await getAgingThresholds(supabase);

  // 'rolled' installments are frozen — their own balance was absorbed into
  // the next installment, so they're excluded from being "the overdue one".
  // 'moved' installments are frozen the same way (Fixes Plan Phase 1,
  // Issue 8) — a Move of Payment defers the obligation until the deadline;
  // penalising it before then is the exact opposite of the feature's point,
  // and leaves the row stuck where the deadline-revert can't find it.
  const overdue = (schedules ?? [])
    .filter((row) => row.status !== "rolled" && row.status !== "moved")
    .filter((row) => daysPastDue(row.due_date as string, asOf) > 0)
    .sort((a, b) =>
      (a.due_date as string).localeCompare(b.due_date as string),
    )[0];

  let agingBucket = "current" as ReturnType<typeof computeAgingBucket>;
  if (overdue) {
    agingBucket = computeAgingBucket(
      daysPastDue(overdue.due_date as string, asOf),
      thresholds,
    );
  }

  const penaltyRate = await getPenaltyRate(
    supabase,
    masterlistRow.segment as string | null,
  );
  let finalPenalty = Number(overdue?.penalty_amount ?? 0);

  if (overdue && daysPastDue(overdue.due_date as string, asOf) >= 1) {
    // Penalty is charged on the installment's own unpaid balance only — NOT on
    // the penalty already accrued against it. Including accrued penalty here
    // made this non-idempotent: every re-run (nightly cron, each Collector
    // accounts GET, each dev-simulate click) computed a strictly larger figure
    // and inserted another `penalties` row, converging to rate/(1-rate) instead
    // of rate. Month-over-month compounding is delivered by the 30-day rollover
    // below, which folds balance + penalty into the next installment — that
    // installment's amount_due then carries it, so compounding still happens
    // once per month, exactly as `penalty_rate*` config ("per month") intends.
    // Net of discount — an installment whose discount hasn't reverted yet
    // at the exact moment penalty/reversion both run in the same pass
    // (e.g. a large "Simulate delinquency" jump) must be penalized on what's
    // really still owed, not the gross figure (fixed 2026-08-31, see
    // docs/payment-flow-discount-audit-and-fix-plan.md).
    const outstanding = netInstallmentDue({
      amountDue: Number(overdue.amount_due),
      discountAmount: overdue.discount_amount,
      amountPaid: Number(overdue.amount_paid),
    });
    const penalty = calculatePenaltyAmount(outstanding, penaltyRate);

    if (penalty > Number(overdue.penalty_amount ?? 0)) {
      await supabase
        .from("amortization_schedules")
        .update({
          penalty_amount: penalty,
          status: "overdue",
        })
        .eq("id", overdue.id);

      await supabase.from("penalties").insert({
        masterlist_id: masterlistId,
        amortization_schedule_id: overdue.id,
        amount: halfUp(penalty - Number(overdue.penalty_amount ?? 0)),
        rate_applied: penaltyRate,
        notes: "Missed payment penalty",
      });

      finalPenalty = penalty;
    }

    // One-time 30-day rollover: fold the whole overdue balance (principal +
    // accrued penalty) into the next unpaid installment, then freeze this
    // one. Guarded by rolled_at so it only ever fires once per installment.
    const dpd = daysPastDue(overdue.due_date as string, asOf);
    if (dpd >= thresholds.t30 && !overdue.rolled_at) {
      const next = (schedules ?? [])
        .filter(
          (row) =>
            row.id !== overdue.id &&
            row.status !== "rolled" &&
            // never roll an overdue balance into a frozen 'moved' row
            // (Fixes Plan Phase 1, Issue 8).
            row.status !== "moved",
        )
        .sort(
          (a, b) => (a.installment_no as number) - (b.installment_no as number),
        )[0];

      if (next) {
        // Net of both the interest-side discount AND any Collector
        // penalty waiver — roll forward what's really still owed, not
        // the gross figure (feature-collector-discount-implementation-plan.md,
        // Phase 5; SQL twin: refresh_one_masterlist_aging).
        const rollAmount = netInstallmentDue({
          amountDue: Number(overdue.amount_due),
          discountAmount: overdue.discount_amount,
          amountPaid: Number(overdue.amount_paid),
          penaltyAmount: finalPenalty,
          penaltyDiscountAmount: overdue.penalty_discount_amount,
        });
        // Split rollAmount into its interest and penalty portions instead of
        // dumping the whole thing into the destination row's amount_due —
        // otherwise the rolled-forward penalty becomes invisible to the
        // Collector Discount "penalty discount" picker (which keys off
        // amount_due, and requires penaltyAmount > 0 (confirmed live
        // 2026-09-04, AN300449: after a roll, no installment had a nonzero
        // penalty_amount, even though real penalty money had rolled forward
        // — the picker's "penalty discount" section had nothing to show).
        // penaltyPortion is computed independently and interestPortion is
        // defined as the remainder, so the two always sum to exactly
        // rollAmount — the destination row's TOTAL net-due is unchanged,
        // only which column carries which part of it.
        const penaltyPortion = Math.max(
          0,
          halfUp(finalPenalty - (Number(overdue.penalty_discount_amount) || 0)),
        );
        const interestPortion = halfUp(rollAmount - penaltyPortion);
        const now = new Date().toISOString();

        await supabase
          .from("amortization_schedules")
          .update({
            amount_due: Number(next.amount_due) + interestPortion,
            penalty_amount: Number(next.penalty_amount ?? 0) + penaltyPortion,
          })
          .eq("id", next.id);

        await supabase
          .from("amortization_schedules")
          .update({
            status: "rolled",
            rolled_at: now,
            rolled_into_installment_no: next.installment_no,
            // Consumed by the roll calculation above — zero it so a
            // stale figure on a rolled row can't be double-counted later.
            penalty_discount_amount: 0,
          })
          .eq("id", overdue.id);

        await supabase.from("penalties").insert({
          masterlist_id: masterlistId,
          amortization_schedule_id: overdue.id,
          amount: rollAmount,
          rate_applied: penaltyRate,
          notes: `30-day rollover: ${rollAmount.toFixed(2)} rolled into installment #${next.installment_no}`,
        });
      }
    }
  }

  // Origination-discount reversion (feature-new-loan-origination-discount.md,
  // Rule 6) — a separate concern from the penalty/rollover logic above, not
  // merged into it and not conditioned on `overdue`/`agingBucket`: any
  // installment whose due date has arrived — discounted or not, paid or not
  // by the time this runs — loses its origination discount. Idempotent by
  // construction: clearing an already-zero discount_amount is a no-op, so
  // this is safe under the same repeat-call conditions that caused the
  // penalty bug this function was fixed for (nightly cron, every Collector
  // accounts GET, dev-simulate calls).
  const expiredDiscountRows = (schedules ?? [])
    // don't revert a 'moved' row's discount while it is frozen — it may
    // still return on the deadline (Fixes Plan Phase 1, Issue 8).
    .filter((row) => row.status !== "rolled" && row.status !== "moved")
    .filter((row) => Number(row.discount_amount ?? 0) > 0)
    .filter((row) => daysPastDue(row.due_date as string, asOf) >= 0);

  const expiredDiscountIds = expiredDiscountRows.map((row) => row.id as string);
  const revertedDiscountTotal = halfUp(
    expiredDiscountRows.reduce((sum, row) => sum + Number(row.discount_amount ?? 0), 0),
  );

  if (expiredDiscountIds.length > 0) {
    await supabase
      .from("amortization_schedules")
      .update({ discount_amount: 0 })
      .in("id", expiredDiscountIds);
  }

  const remedialFlag = agingBucket === "91+";

  const masterlistUpdate: Record<string, unknown> = {
    aging_bucket: agingBucket,
    remedial_flag: remedialFlag,
  };

  // The account's total/balance were set at release assuming every
  // origination discount above would be honored. A reverted discount
  // (Rule 6, above) means the borrower now owes that money after all — carry
  // it onto both figures the same way a posted payment carries a reduction,
  // so Outstanding Balance and the ledger's opening debit/Report Total stay
  // in agreement (confirmed 2026-08-31: they diverged on AN300432 without
  // this — balance stayed net of a discount that had already reverted).
  if (revertedDiscountTotal > 0) {
    masterlistUpdate.total_loan = halfUp(
      Number(masterlistRow.total_loan ?? 0) + revertedDiscountTotal,
    );
    // Derived fresh from the rows (Phase 4, see
    // docs/ledger-balance-consistency-fix-implementation-plan.md) — the
    // discount_amount=0 update above already ran, so this naturally reflects
    // the reversion. total_loan (the originally disclosed obligation) stays
    // a plain accumulation, out of scope for this derived-balance replacement.
    masterlistUpdate.outstanding_balance = await recomputeOutstandingBalance(
      supabase,
      masterlistId,
    );
  }
  if (remedialFlag) {
    masterlistUpdate.account_status = "remedial";
  }

  await supabase.from("masterlist").update(masterlistUpdate).eq("id", masterlistId);

  return { agingBucket, remedialFlag };
}

/**
 * AR rejects a submitted DCRR — e.g. deposit doesn't match, wrong payments
 * batched, misallocated. Payments stay at `confirmed`: `isActiveDcrStatus()`
 * already excludes 'rejected', so they're immediately eligible to be
 * re-batched onto a new DCRR without any extra revert step. Returns enough
 * to notify the submitter and every distinct borrower whose payment was
 * batched in.
 */
export async function rejectDcr(
  supabase: SupabaseClient,
  dcrId: string,
  actorId: string,
  reason: string,
): Promise<{
  collectorUserId: string;
  loanApplicationIds: string[];
}> {
  const { data: dcr } = await supabase
    .from("dcr")
    .select("id, status, collector_user_id")
    .eq("id", dcrId)
    .single();

  if (!dcr || dcr.status !== "submitted") {
    throw new Error("DCRR must be submitted before it can be rejected");
  }

  const now = new Date().toISOString();

  // Snapshot line items before deleting `dcr_items` — `dcr_items_payment_id_unique`
  // means the row must be gone before the payment can be re-batched, but AR/Collector
  // still need to see what was rejected, so the display data is preserved on `dcr`.
  const { data: items, error: itemsError } = await supabase
    .from("dcr_items")
    .select(
      `
      id,
      amount,
      payment_id,
      payments (
        id,
        reference_no,
        payment_date,
        amount,
        masterlist_id,
        storage_path,
        file_name,
        notes,
        loan_application_id,
        masterlist ( borrower_name, loan_account_no, segment )
      )
    `,
    )
    .eq("dcr_id", dcrId);

  if (itemsError) {
    throw new Error(itemsError.message);
  }

  const loanApplicationIds = new Set<string>();
  for (const item of items ?? []) {
    const raw = item.payments as
      | { loan_application_id?: string | null }
      | { loan_application_id?: string | null }[]
      | null;
    const payment = Array.isArray(raw) ? raw[0] : raw;
    if (payment?.loan_application_id) {
      loanApplicationIds.add(payment.loan_application_id);
    }
  }

  const { error: updateError } = await supabase
    .from("dcr")
    .update({
      status: "rejected",
      rejected_by: actorId,
      rejected_at: now,
      notes: reason,
      rejected_items: items ?? [],
    })
    .eq("id", dcrId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  // dcr_items RLS only allows the owning collector to write while
  // dcr.status = 'draft' — both conditions are already false here (status
  // was just flipped to 'rejected' above, and the actor is AR, not the
  // collector). The session client's delete would silently affect zero
  // rows, leaving a stale dcr_items row that then blocks re-adding the same
  // payment to a new draft via dcr_items_payment_id_unique. Use the service
  // client for this specific write, and verify the count so a future RLS
  // change can't reintroduce the same silent no-op.
  const admin = createServiceClient();
  const { data: deletedItems, error: deleteError } = await admin
    .from("dcr_items")
    .delete()
    .eq("dcr_id", dcrId)
    .select("id");

  if (deleteError) {
    throw new Error(deleteError.message);
  }
  if ((deletedItems?.length ?? 0) !== (items ?? []).length) {
    throw new Error(
      `Expected to delete ${(items ?? []).length} dcr_items but removed ${deletedItems?.length ?? 0}`,
    );
  }

  const paymentIds = (items ?? [])
    .map((item) => item.payment_id as string)
    .filter(Boolean);
  if (paymentIds.length) {
    const { error: flagError } = await supabase
      .from("payments")
      .update({ flagged_reason: reason, flagged_at: now })
      .in("id", paymentIds);
    if (flagError) throw new Error(flagError.message);
  }

  return {
    collectorUserId: dcr.collector_user_id as string,
    loanApplicationIds: Array.from(loanApplicationIds),
  };
}

/**
 * Posts a single dcr_item: allocates it against open installments, records
 * the posting(s), updates the schedule/masterlist balance, and marks the
 * payment posted. Shared by the whole-DCR reconcile path and the per-item
 * reconcile path — the actual ledger mechanics are identical either way,
 * only the deposit-reference/amount bookkeeping differs by caller.
 */
async function postSingleDcrItem(
  supabase: SupabaseClient,
  dcrId: string,
  item: { id: string; payment_id: string; amount: number },
  actorId: string,
  now: string,
) {
  const { data: payment } = await supabase
    .from("payments")
    .select("id, masterlist_id, amount, status")
    .eq("id", item.payment_id)
    .single();

  if (!payment || payment.status === "posted") {
    return;
  }

  const { data: storedAllocations } = await supabase
    .from("dcr_item_allocations")
    .select("amortization_schedule_id, amount")
    .eq("dcr_item_id", item.id);

  let allocationLines: AllocationLine[];
  if (storedAllocations?.length) {
    allocationLines = storedAllocations.map((row) => ({
      amortizationScheduleId: row.amortization_schedule_id as string | null,
      amount: Number(row.amount),
    }));
  } else {
    const openInstallments = await fetchOpenInstallments(
      supabase,
      payment.masterlist_id as string,
    );
    allocationLines = computeAutoAllocation(
      Number(item.amount),
      openInstallments,
    );
  }

  // The actual writes (posting insert(s), schedule update(s), payment
  // status, balance recompute+update) run atomically in one Postgres
  // function — a partial failure here used to leave a durable inconsistent
  // state, and the idempotency guard above only became true on the LAST of
  // those four steps, so a retry after a mid-sequence crash re-ran
  // everything from the top (Phase 5, see
  // docs/ledger-balance-consistency-fix-implementation-plan.md). The
  // function re-checks payment status itself (locked via `for update`) as
  // its first statement, so this call is safe to retry.
  const { error: rpcError } = await supabase.rpc("post_single_dcr_item", {
    p_dcr_id: dcrId,
    p_payment_id: payment.id,
    p_allocations: allocationLines.map((line) => ({
      amortizationScheduleId: line.amortizationScheduleId,
      amount: line.amount,
    })),
    p_actor_id: actorId,
    p_now: now,
  });

  if (rpcError) throw new Error(rpcError.message);
}

/**
 * Reconciles one line item within a submitted DCRR independently of the
 * others — each borrower's payment gets its own deposit reference/amount
 * and its own accept, instead of requiring one shared deposit that covers
 * every item in the batch. Sibling items keep whatever status they're in;
 * once every item on the DCR has been resolved (posted or rejected), the
 * parent `dcr` row's own status is updated for collector-side visibility.
 */
export async function reconcileDcrItem(
  supabase: SupabaseClient,
  dcrItemId: string,
  actorId: string,
  input: {
    depositReference: string;
    depositAmount: number;
    depositProofPath?: string | null;
  },
) {
  const { data: item } = await supabase
    .from("dcr_items")
    .select("id, dcr_id, payment_id, amount, status")
    .eq("id", dcrItemId)
    .single();

  if (!item) {
    throw new Error("DCRR line item not found");
  }
  if (item.status !== "pending") {
    throw new Error("This line item was already processed");
  }

  const { data: dcr } = await supabase
    .from("dcr")
    .select("id, status")
    .eq("id", item.dcr_id)
    .single();

  if (!dcr || dcr.status !== "submitted") {
    throw new Error("DCRR must be submitted before reconciliation");
  }

  // The confirmed bank deposit must match THIS item's amount — a mismatch
  // means the report and the bank disagree on this specific payment, so it
  // doesn't post. Other items on the same DCR are unaffected.
  const itemAmount = halfUp(Number(item.amount));
  if (halfUp(input.depositAmount) !== itemAmount) {
    throw new Error(
      `Deposit amount ${input.depositAmount.toFixed(2)} does not match this line item's amount ${itemAmount.toFixed(2)} — verify the bank deposit before posting`,
    );
  }

  const now = new Date().toISOString();

  await postSingleDcrItem(
    supabase,
    item.dcr_id as string,
    { id: item.id as string, payment_id: item.payment_id as string, amount: itemAmount },
    actorId,
    now,
  );

  const admin = createServiceClient();
  const { error: itemError } = await admin
    .from("dcr_items")
    .update({
      status: "posted",
      deposit_reference: input.depositReference,
      deposit_amount: itemAmount,
      posted_by: actorId,
      posted_at: now,
    })
    .eq("id", dcrItemId);

  if (itemError) {
    throw new Error(itemError.message);
  }

  await settleDcrStatusIfComplete(admin, item.dcr_id as string, actorId, now);

  return { status: "posted" as const };
}

/**
 * Rejects one line item within a submitted DCRR — frees its payment for
 * re-batching onto a new draft, same as whole-DCR rejection, but leaves
 * every other item on this DCR untouched. Snapshot is appended onto the
 * parent `dcr.rejected_items` array so AR/Collector history keeps a full
 * record even though the row itself is removed (dcr_items_payment_id_unique
 * requires the row gone before the payment can be re-batched).
 */
export async function rejectDcrItem(
  supabase: SupabaseClient,
  dcrItemId: string,
  actorId: string,
  reason: string,
) {
  const { data: item, error: itemFetchError } = await supabase
    .from("dcr_items")
    .select(
      `
      id,
      dcr_id,
      amount,
      payment_id,
      status,
      payments (
        id,
        reference_no,
        payment_date,
        amount,
        masterlist_id,
        storage_path,
        file_name,
        notes,
        loan_application_id,
        masterlist ( borrower_name, loan_account_no, segment )
      )
    `,
    )
    .eq("id", dcrItemId)
    .single();

  if (itemFetchError || !item) {
    throw new Error("DCRR line item not found");
  }
  if (item.status !== "pending") {
    throw new Error("This line item was already processed");
  }

  const { data: dcr } = await supabase
    .from("dcr")
    .select("id, status, collector_user_id, rejected_items")
    .eq("id", item.dcr_id)
    .single();

  if (!dcr || dcr.status !== "submitted") {
    throw new Error("DCRR must be submitted before it can be rejected");
  }

  const now = new Date().toISOString();
  const admin = createServiceClient();

  const priorSnapshot = (dcr.rejected_items as unknown[]) ?? [];
  const { error: snapshotError } = await admin
    .from("dcr")
    .update({
      rejected_items: [
        ...priorSnapshot,
        { id: item.id, amount: item.amount, payments: item.payments, rejectedAt: now, reason },
      ],
    })
    .eq("id", item.dcr_id);
  if (snapshotError) {
    throw new Error(snapshotError.message);
  }

  const { error: flagError } = await admin
    .from("payments")
    .update({ flagged_reason: reason, flagged_at: now })
    .eq("id", item.payment_id);
  if (flagError) {
    throw new Error(flagError.message);
  }

  // Delete (not soft-status "rejected") — same dcr_items_payment_id_unique
  // constraint reasoning as whole-DCR rejection: the row must be gone
  // before this payment can be re-batched onto a new draft.
  const { error: deleteError } = await admin
    .from("dcr_items")
    .delete()
    .eq("id", dcrItemId);
  if (deleteError) {
    throw new Error(deleteError.message);
  }

  await settleDcrStatusIfComplete(admin, item.dcr_id as string, actorId, now);

  const paymentsRaw = item.payments as
    | { loan_application_id?: string | null }
    | { loan_application_id?: string | null }[]
    | null;
  const paymentRow = Array.isArray(paymentsRaw) ? paymentsRaw[0] : paymentsRaw;

  return {
    status: "rejected" as const,
    collectorUserId: dcr.collector_user_id as string,
    loanApplicationId: (paymentRow?.loan_application_id as string) ?? null,
  };
}

/**
 * Once every remaining dcr_item on a DCR has left "pending" (each was
 * individually posted or rejected), roll the parent dcr.status forward so
 * it drops out of AR's active queue: "reconciled" if anything posted,
 * "rejected" only if every item ended up rejected. Left at "submitted"
 * while any item is still pending.
 */
async function settleDcrStatusIfComplete(
  admin: SupabaseClient,
  dcrId: string,
  actorId: string,
  now: string,
) {
  const { data: remaining } = await admin
    .from("dcr_items")
    .select("status")
    .eq("dcr_id", dcrId);

  const rows = remaining ?? [];
  if (rows.some((row) => row.status === "pending")) {
    return;
  }

  const anyPosted = rows.some((row) => row.status === "posted");

  await admin
    .from("dcr")
    .update(
      anyPosted
        ? { status: "reconciled", reconciled_by: actorId, reconciled_at: now }
        : { status: "rejected", rejected_by: actorId, rejected_at: now },
    )
    .eq("id", dcrId);
}

export async function reconcileAndPostDcr(
  supabase: SupabaseClient,
  dcrId: string,
  actorId: string,
  input: {
    depositReference: string;
    depositAmount: number;
    depositProofPath?: string | null;
  },
) {
  const { data: dcr } = await supabase
    .from("dcr")
    .select("id, status, collector_user_id")
    .eq("id", dcrId)
    .single();

  if (!dcr || dcr.status !== "submitted") {
    throw new Error("DCRR must be submitted before reconciliation");
  }

  const { data: items } = await supabase
    .from("dcr_items")
    .select("id, payment_id, amount")
    .eq("dcr_id", dcrId);

  if (!items?.length) {
    throw new Error("DCRR has no payment items");
  }

  // The confirmed bank deposit must match the DCR total — a mismatched
  // deposit means the report and the bank disagree, so nothing posts.
  const dcrTotal = halfUp(
    items.reduce((sum, item) => sum + Number(item.amount), 0),
  );
  if (halfUp(input.depositAmount) !== dcrTotal) {
    throw new Error(
      `Deposit amount ${input.depositAmount.toFixed(2)} does not match the DCRR total ${dcrTotal.toFixed(2)} — verify the bank deposit before posting`,
    );
  }

  const now = new Date().toISOString();

  for (const item of items) {
    await postSingleDcrItem(
      supabase,
      dcrId,
      { id: item.id, payment_id: item.payment_id, amount: Number(item.amount) },
      actorId,
      now,
    );
  }

  await supabase
    .from("dcr")
    .update({
      status: "reconciled",
      reconciled_by: actorId,
      reconciled_at: now,
      deposit_reference: input.depositReference,
      deposit_amount: halfUp(input.depositAmount),
      deposit_proof_path: input.depositProofPath ?? null,
    })
    .eq("id", dcrId);

  return { status: "reconciled" as const };
}

export async function submitDcr(
  supabase: SupabaseClient,
  dcrId: string,
  collectorUserId: string,
  /** Service-role client for the Task-4 duplicate backstop; injectable for
   * tests. Defaults to `createServiceClient()`. */
  serviceClient?: SupabaseClient,
) {
  const { data: dcr } = await supabase
    .from("dcr")
    .select("id, status, collector_user_id")
    .eq("id", dcrId)
    .single();

  if (!dcr || dcr.collector_user_id !== collectorUserId) {
    throw new Error("DCRR not found");
  }

  if (dcr.status !== "draft") {
    throw new Error("DCRR already submitted");
  }

  const { count } = await supabase
    .from("dcr_items")
    .select("id", { count: "exact", head: true })
    .eq("dcr_id", dcrId);

  if (!count) {
    throw new Error("Add at least one payment to the DCRR");
  }

  // Task 4 backstop (amount-aware) — a draft built before another DCRR claimed
  // one of its installments. For each account this DCRR touches, does its own
  // total per installment, plus what OTHER unposted DCRRs already hold, exceed
  // what the installment owes?
  const dupAdmin = serviceClient ?? createServiceClient();
  const ownAllocs = await loadDcrAllocationsWithMasterlist(dupAdmin, dcrId);
  const ownByMasterlist = new Map<string, Record<string, number>>();
  for (const a of ownAllocs) {
    if (!a.scheduleId || !a.masterlistId) continue;
    const m = ownByMasterlist.get(a.masterlistId) ?? {};
    m[a.scheduleId] = (m[a.scheduleId] ?? 0) + a.amount;
    ownByMasterlist.set(a.masterlistId, m);
  }
  const submitOverAllocated: string[] = [];
  for (const [mlId, ownByInstallment] of ownByMasterlist) {
    const pendingRaw = await loadPendingAllocationsForAccount(
      dupAdmin,
      mlId,
      dcrId, // exclude self — this DCRR's own totals are `ownByInstallment`
    );
    const pendingByInstallment: Record<string, number> = {};
    for (const [sid, v] of Object.entries(pendingRaw)) {
      pendingByInstallment[sid] = v.amount;
    }
    const openForDue = await fetchOpenInstallments(dupAdmin, mlId);
    const remainingDue: Record<string, number> = {};
    for (const inst of openForDue) {
      remainingDue[inst.id] = netInstallmentDue({
        amountDue: inst.amountDue,
        discountAmount: inst.discountAmount,
        penaltyAmount: inst.penaltyAmount,
        amountPaid: inst.amountPaid,
      });
    }
    submitOverAllocated.push(
      ...findOverAllocatedInstallments({
        candidate: ownByInstallment,
        pending: pendingByInstallment,
        remainingDue,
      }),
    );
  }
  if (submitOverAllocated.length > 0) {
    throw new Error(
      "This DCRR would over-fill an installment that another unposted DCRR " +
        "already covers. Resolve that before submitting.",
    );
  }

  const now = new Date().toISOString();

  await supabase
    .from("dcr")
    .update({
      status: "submitted",
      submitted_at: now,
    })
    .eq("id", dcrId);

  const { data: items } = await supabase
    .from("dcr_items")
    .select("payment_id")
    .eq("dcr_id", dcrId);

  for (const item of items ?? []) {
    await supabase
      .from("payments")
      .update({ status: "confirmed", reviewed_at: now })
      .eq("id", item.payment_id)
      .eq("status", "pending_verification");
  }

  return { status: "submitted" as const, submittedAt: now };
}

export async function createDcrDraft(
  supabase: SupabaseClient,
  collectorUserId: string,
) {
  const { data, error } = await supabase
    .from("dcr")
    .insert({ collector_user_id: collectorUserId, status: "draft" })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create DCRR");
  }

  return { dcrId: data.id as string };
}

export type CollectorDiscountInput = {
  interestDiscountAmount: number;
  interestDiscountedInstallmentNos: number[];
  penaltyDiscountAmount: number;
  penaltyDiscountedInstallmentNos: number[];
  discountReason: string;
};

/** Penalty breakdown Phase 4b — the collector's manual split of a payment into
 * "this much is late-fee money". NOT a discount/waiver (nothing is forgiven),
 * so it carries no permission gate and no reason. `post_single_dcr_item` splits
 * `penaltyPaidAmount` evenly across `penaltyPaidInstallmentNos` and writes it to
 * `postings.penalty_amount`, capped at the fee actually owed. */
export type CollectorPenaltyPaidInput = {
  penaltyPaidAmount: number;
  penaltyPaidInstallmentNos: number[];
};

/**
 * Server-side re-derivation of the true maximum a Collector discount can
 * be — required, not optional (feature-collector-discount-implementation-plan.md,
 * Phase 5). Phase 3's percent clamp (0-100%) only constrains a
 * well-behaved client; `dcr_items` stores a computed peso amount, so a
 * request that sends an inflated amount directly (bypassing the UI's
 * percent math entirely) must be caught here, independently, before it
 * can ever reach the posting RPC — an unbounded discount would let a
 * trivially small payment satisfy Pass B's closure check and mark a real
 * debt 'paid'. This is a genuinely new check, not an existing pattern:
 * the ordinary `amount` field on this same insert has no equivalent
 * server-side maximum, because an oversized ordinary payment is harmless
 * (it just becomes an advance line) — an oversized discount is not.
 */
async function validateCollectorDiscountInput(
  supabase: SupabaseClient,
  masterlistId: string,
  input: CollectorDiscountInput,
): Promise<void> {
  const hasInterest = input.interestDiscountAmount > 0;
  const hasPenalty = input.penaltyDiscountAmount > 0;
  if (!hasInterest && !hasPenalty) return;

  if (hasInterest && input.interestDiscountedInstallmentNos.length === 0) {
    throw new Error(
      "Interest discount amount was entered without selecting any installments",
    );
  }
  if (hasPenalty && input.penaltyDiscountedInstallmentNos.length === 0) {
    throw new Error(
      "Penalty discount amount was entered without selecting any installments",
    );
  }
  if (!input.discountReason || input.discountReason.trim() === "") {
    throw new Error("A reason is required when a Collector discount is entered");
  }

  if (hasInterest) {
    const interestPerRow = await deriveInterestPerRow(supabase, masterlistId);
    const maxInterest = halfUp(
      interestPerRow * input.interestDiscountedInstallmentNos.length,
    );
    if (input.interestDiscountAmount > maxInterest) {
      throw new Error(
        `Interest discount amount ${input.interestDiscountAmount.toFixed(2)} exceeds the real interest available on the selected installments (${maxInterest.toFixed(2)})`,
      );
    }
  }

  if (hasPenalty) {
    const { data: rows, error } = await supabase
      .from("amortization_schedules")
      .select("installment_no, penalty_amount")
      .eq("masterlist_id", masterlistId)
      .in("installment_no", input.penaltyDiscountedInstallmentNos);

    if (error) throw new Error(error.message);

    const maxPenalty = halfUp(
      (rows ?? []).reduce(
        (sum, row) => sum + Number(row.penalty_amount ?? 0),
        0,
      ),
    );
    if (input.penaltyDiscountAmount > maxPenalty) {
      throw new Error(
        `Penalty discount amount ${input.penaltyDiscountAmount.toFixed(2)} exceeds the real penalty on the selected installments (${maxPenalty.toFixed(2)})`,
      );
    }
  }
}

export async function addPaymentToDcr(
  supabase: SupabaseClient,
  dcrId: string,
  paymentId: string,
  collectorUserId: string,
  allocations?: AllocationLine[],
  discountInput?: CollectorDiscountInput,
  /** Service-role client for the Task-4 duplicate lookup (see below). Defaults
   * to `createServiceClient()`; injectable so unit tests can stub it. */
  serviceClient?: SupabaseClient,
  /** Penalty breakdown Phase 4b — collector's manual fee split, if any.
   * Trailing param so every existing positional caller (incl. the Task-4
   * tests that inject `serviceClient`) is unaffected. */
  penaltyPaidInput?: CollectorPenaltyPaidInput,
) {
  const { data: dcr } = await supabase
    .from("dcr")
    .select("id, status, collector_user_id")
    .eq("id", dcrId)
    .single();

  if (!dcr || dcr.collector_user_id !== collectorUserId || dcr.status !== "draft") {
    throw new Error("DCRR not editable");
  }

  const { data: payment } = await supabase
    .from("payments")
    .select("id, amount, status, masterlist_id")
    .eq("id", paymentId)
    .single();

  if (!payment || !["pending_verification", "confirmed"].includes(payment.status as string)) {
    throw new Error("Payment not available for DCRR");
  }

  const { data: existingItems, error: existingError } = await supabase
    .from("dcr_items")
    .select("id, dcr!inner ( id, status )")
    .eq("payment_id", paymentId);

  if (existingError) throw new Error(existingError.message);

  const alreadyBatched = (existingItems ?? []).some((row) => {
    const dcr = row.dcr as { status?: string } | { status?: string }[] | null;
    const status = Array.isArray(dcr) ? dcr[0]?.status : dcr?.status;
    return isActiveDcrStatus(status ?? "");
  });

  if (alreadyBatched) {
    throw new Error("Payment is already on a DCRR");
  }

  const masterlistId = payment.masterlist_id as string;
  let resolvedAllocations: AllocationLine[];

  if (allocations) {
    await validateAllocationLines(
      supabase,
      masterlistId,
      Number(payment.amount),
      allocations,
    );
    resolvedAllocations = allocations;
  } else {
    const openInstallments = await fetchOpenInstallments(supabase, masterlistId);
    resolvedAllocations = computeAutoAllocation(
      Number(payment.amount),
      openInstallments,
    );
  }

  // Task 4 — over-allocation block (amount-aware, Option 1). Adding to a
  // partly-claimed installment is fine; only a real *over*-fill is refused —
  // where this payment's allocation + everything already pending on OTHER
  // unposted DCRRs for this account would exceed what the installment still
  // owes. This matches the "₱X free" hint the Allocate modal shows. Service-
  // role lookup (RLS hides other collectors' DCRRs); throws on error.
  const candidateByInstallment: Record<string, number> = {};
  for (const line of resolvedAllocations) {
    if (line.amortizationScheduleId) {
      candidateByInstallment[line.amortizationScheduleId] =
        (candidateByInstallment[line.amortizationScheduleId] ?? 0) + line.amount;
    }
  }
  if (Object.keys(candidateByInstallment).length > 0) {
    const dupAdmin = serviceClient ?? createServiceClient();
    // No excludeDcrId: this draft's own already-added items count toward the
    // installment total too, so re-filling the same row twice is caught.
    const pendingRaw = await loadPendingAllocationsForAccount(
      dupAdmin,
      masterlistId,
    );
    const pendingByInstallment: Record<string, number> = {};
    for (const [sid, v] of Object.entries(pendingRaw)) {
      pendingByInstallment[sid] = v.amount;
    }
    const openForDue = await fetchOpenInstallments(supabase, masterlistId);
    const remainingDue: Record<string, number> = {};
    for (const inst of openForDue) {
      remainingDue[inst.id] = netInstallmentDue({
        amountDue: inst.amountDue,
        discountAmount: inst.discountAmount,
        penaltyAmount: inst.penaltyAmount,
        amountPaid: inst.amountPaid,
      });
    }
    const overAllocated = findOverAllocatedInstallments({
      candidate: candidateByInstallment,
      pending: pendingByInstallment,
      remainingDue,
    });
    if (overAllocated.length > 0) {
      throw new Error(
        "This payment would over-fill an installment that another unposted " +
          "DCRR already covers. Post or reject that DCRR first, or reduce the " +
          "overlapping amount to what is still open on that installment.",
      );
    }
  }

  if (discountInput) {
    await validateCollectorDiscountInput(supabase, masterlistId, discountInput);
  }

  const { data: dcrItem, error } = await supabase
    .from("dcr_items")
    .insert({
      dcr_id: dcrId,
      payment_id: paymentId,
      amount: payment.amount,
      // Draft-time save only — matches Constraint 4: never applied to any
      // balance until post_single_dcr_item runs at actual posting time.
      interest_discount_amount: discountInput?.interestDiscountAmount ?? 0,
      interest_discounted_installment_nos:
        discountInput?.interestDiscountedInstallmentNos ?? [],
      penalty_discount_amount: discountInput?.penaltyDiscountAmount ?? 0,
      penalty_discounted_installment_nos:
        discountInput?.penaltyDiscountedInstallmentNos ?? [],
      discount_reason: discountInput?.discountReason?.trim() || null,
      // Phase 4b — draft-time save only; applied by post_single_dcr_item at
      // posting, capped there at the fee actually owed.
      penalty_paid_amount: Math.max(
        0,
        penaltyPaidInput?.penaltyPaidAmount ?? 0,
      ),
      penalty_paid_installment_nos:
        (penaltyPaidInput?.penaltyPaidAmount ?? 0) > 0
          ? (penaltyPaidInput?.penaltyPaidInstallmentNos ?? [])
          : [],
    })
    .select("id")
    .single();

  if (error || !dcrItem) {
    throw new Error(error?.message ?? "Failed to add payment to DCRR");
  }

  if (resolvedAllocations.length > 0) {
    const { error: allocError } = await supabase
      .from("dcr_item_allocations")
      .insert(
        resolvedAllocations.map((line) => ({
          dcr_item_id: dcrItem.id,
          amortization_schedule_id: line.amortizationScheduleId,
          amount: line.amount,
        })),
      );

    if (allocError) {
      throw new Error(allocError.message);
    }
  }
}
