import type { SupabaseClient } from "@supabase/supabase-js";

import {
  loadPendingAllocationsForAccount,
  UNPOSTED_PAYMENT_STATUSES,
} from "@/lib/ar/duplicate-dcr";
import { halfUp, netInstallmentDue } from "@/lib/computation/money";

/**
 * Task 4b — the balance a collector sees (`masterlist.outstanding_balance`)
 * only ever updates at post time (`post_single_dcr_item`, invoked only when
 * AR posts a DCR). Between "collector records a payment" and "AR posts it,"
 * that number is stale — it doesn't reflect money already recorded. This
 * module computes a second, read-time-only "effective" balance = posted
 * minus everything already recorded but not yet posted, without ever writing
 * to the posted figure. See docs/revision-plans/task-04b-effective-balance-plan.md.
 */

export type PostedInstallment = {
  id: string;
  /** Already net of discount/penalty/penalty-discount/amount_paid — see
   * `netInstallmentDue` (`@/lib/computation/money`). Callers must include
   * `penalty_discount_amount` when computing this — `fetchOpenInstallments`
   * (`@/lib/ar/posting`) does NOT select that column, so summing its rows
   * unmodified can silently disagree with the true posted balance on an
   * account with an active penalty discount (Plan Phase 2 correction,
   * 2026-09-15). */
  netRemaining: number;
};

export type EffectiveBalanceInput = {
  postedInstallments: PostedInstallment[];
  /** Sum of everything sitting in a draft/submitted DCR's pending items,
   * grouped by installment. From `loadPendingAllocationsForAccount`. */
  allocatedPendingByScheduleId: Map<string, number>;
  /** A confirmed/pending_verification payment not yet added to any DCR at
   * all — can't be pinned to an installment, only to the account total. */
  unallocatedPendingTotal: number;
};

export type PerInstallmentEffective = {
  id: string;
  netRemaining: number;
  pendingApplied: number;
  effectiveRemaining: number;
};

export type EffectiveBalanceResult = {
  postedTotal: number;
  effectiveTotal: number;
  perInstallment: PerInstallmentEffective[];
  pendingAllocatedTotal: number;
  pendingUnallocatedTotal: number;
};

/**
 * Pure. Never invents a negative advance — every installment and both totals
 * floor at 0, same convention as `netInstallmentDue` and
 * `findOverAllocatedInstallments` (`@/lib/ar/duplicate-dcr`) already use
 * elsewhere in this codebase.
 */
export function deriveEffectiveBalance(
  input: EffectiveBalanceInput,
): EffectiveBalanceResult {
  const perInstallment: PerInstallmentEffective[] = input.postedInstallments.map(
    (inst) => {
      const pendingApplied = halfUp(
        input.allocatedPendingByScheduleId.get(inst.id) ?? 0,
      );
      const effectiveRemaining = Math.max(
        0,
        halfUp(inst.netRemaining - pendingApplied),
      );
      return {
        id: inst.id,
        netRemaining: inst.netRemaining,
        pendingApplied,
        effectiveRemaining,
      };
    },
  );

  const postedTotal = halfUp(
    input.postedInstallments.reduce((sum, inst) => sum + inst.netRemaining, 0),
  );

  const pendingAllocatedTotal = halfUp(
    perInstallment.reduce((sum, inst) => sum + inst.pendingApplied, 0),
  );
  const pendingUnallocatedTotal = halfUp(
    Math.max(0, input.unallocatedPendingTotal),
  );

  const effectiveTotal = Math.max(
    0,
    halfUp(postedTotal - pendingAllocatedTotal - pendingUnallocatedTotal),
  );

  return {
    postedTotal,
    effectiveTotal,
    perInstallment,
    pendingAllocatedTotal,
    pendingUnallocatedTotal,
  };
}

/**
 * Assembles the three inputs `deriveEffectiveBalance` needs and calls it.
 * Service-role client required — RLS hides another collector's unposted DCRs
 * from a plain session client, and this must see all of them, not silently
 * return zero pending (recurring silent-RLS-gap pattern in this codebase).
 * Throws on any query error rather than defaulting to "no pending."
 */
export async function getAccountEffectiveBalance(
  admin: SupabaseClient,
  masterlistId: string,
): Promise<EffectiveBalanceResult> {
  // Posted installments — a direct select (not `fetchOpenInstallments`,
  // which omits `penalty_discount_amount` — see the `PostedInstallment`
  // doc comment above) so this total matches `recomputeOutstandingBalance`
  // (`@/lib/ar/posting`) exactly, including any active penalty discount.
  const { data: scheduleRows, error: scheduleError } = await admin
    .from("amortization_schedules")
    .select(
      "id, amount_due, discount_amount, penalty_amount, penalty_discount_amount, amount_paid, status",
    )
    .eq("masterlist_id", masterlistId)
    .not("status", "in", "(paid,rolled,moved)");

  if (scheduleError) throw new Error(scheduleError.message);

  const postedInstallments: PostedInstallment[] = (scheduleRows ?? []).map(
    (row) => ({
      id: row.id as string,
      netRemaining: netInstallmentDue({
        amountDue: Number(row.amount_due),
        discountAmount: row.discount_amount as number | null,
        penaltyAmount: row.penalty_amount as number | null,
        penaltyDiscountAmount: row.penalty_discount_amount as number | null,
        amountPaid: row.amount_paid as number | null,
      }),
    }),
  );

  // Allocated pending — reused as-is from Task 4, not re-queried
  // (`duplicate-dcr.ts:180`).
  const pendingRaw = await loadPendingAllocationsForAccount(
    admin,
    masterlistId,
  );
  const allocatedPendingByScheduleId = new Map<string, number>(
    Object.entries(pendingRaw).map(([sid, v]) => [sid, v.amount]),
  );

  // Unallocated pending — a confirmed/pending_verification payment not yet
  // added to any DCR item at all. `payments.status = 'posted'` is set only
  // by the `post_single_dcr_item` RPC, so no join is needed to exclude
  // already-posted payments; the join below is only to tell apart
  // "recorded, not yet batched" from "recorded, sitting in a draft/submitted
  // DCR" (which `loadPendingAllocationsForAccount` above already counts).
  const { data: paymentRows, error: paymentError } = await admin
    .from("payments")
    .select("id, amount")
    .eq("masterlist_id", masterlistId)
    .in("status", UNPOSTED_PAYMENT_STATUSES);

  if (paymentError) throw new Error(paymentError.message);

  const candidatePaymentIds = (paymentRows ?? []).map((r) => r.id as string);
  let batchedPaymentIds = new Set<string>();
  if (candidatePaymentIds.length > 0) {
    // 'pending' only — same convention as `loadPendingAllocationsForAccount`
    // above. A payment can't have a 'posted' dcr_item here: posting flips
    // payments.status to 'posted' in the same RPC, and this payment was
    // already filtered to UNPOSTED_PAYMENT_STATUSES above, so it wouldn't be
    // a candidate if it had one.
    const { data: itemRows, error: itemError } = await admin
      .from("dcr_items")
      .select("payment_id")
      .in("payment_id", candidatePaymentIds)
      .eq("status", "pending");

    if (itemError) throw new Error(itemError.message);
    batchedPaymentIds = new Set(
      (itemRows ?? []).map((r) => r.payment_id as string),
    );
  }

  const unallocatedPendingTotal = halfUp(
    (paymentRows ?? [])
      .filter((r) => !batchedPaymentIds.has(r.id as string))
      .reduce((sum, r) => sum + Number(r.amount), 0),
  );

  return deriveEffectiveBalance({
    postedInstallments,
    allocatedPendingByScheduleId,
    unallocatedPendingTotal,
  });
}
