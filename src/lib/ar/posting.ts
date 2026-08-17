import type { SupabaseClient } from "@supabase/supabase-js";

import { resolvePenaltyRate } from "@/lib/ar/penalty-rate";
import {
  calculatePenaltyAmount,
  computeAgingBucket,
  daysPastDue,
  DEFAULT_AGING_THRESHOLDS,
  type AgingThresholds,
} from "@/lib/ar/schedule";
import { isActiveDcrStatus } from "@/lib/collector/desk";
import { halfUp } from "@/lib/computation/money";

export type OpenInstallment = {
  id: string;
  installmentNo: number;
  amountDue: number;
  penaltyAmount: number;
  amountPaid: number;
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

    const totalDue = halfUp(inst.amountDue + inst.penaltyAmount);
    const remainingDue = halfUp(totalDue - inst.amountPaid);
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

async function fetchOpenInstallments(
  supabase: SupabaseClient,
  masterlistId: string,
): Promise<OpenInstallment[]> {
  const { data, error } = await supabase
    .from("amortization_schedules")
    .select(
      "id, installment_no, amount_due, penalty_amount, amount_paid, status",
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
    amountPaid: Number(row.amount_paid),
    status: row.status as OpenInstallment["status"],
  }));
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
    .in("key", ["penalty_rate", "penalty_rate_sme"]);

  let seafarer = 0.05;
  let sme = 0.05;
  for (const row of data ?? []) {
    if (row.key === "penalty_rate") seafarer = parseRate(row.value, 0.05);
    if (row.key === "penalty_rate_sme") sme = parseRate(row.value, 0.05);
  }

  return resolvePenaltyRate(segment, { seafarer, sme });
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
      "id, masterlist_id, amount_due, penalty_amount, amount_paid, status",
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
  const remainingDue = halfUp(amountDue + penaltyAmount - amountPaid);

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
  const totalDue = halfUp(amountDue + penaltyAmount);

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

  const { data: ml, error: mlReadError } = await supabase
    .from("masterlist")
    .select("outstanding_balance")
    .eq("id", masterlistId)
    .single();

  if (mlReadError) throw new Error(mlReadError.message);

  const newBalance = Math.max(
    0,
    halfUp(Number(ml?.outstanding_balance ?? 0) - remainingDue),
  );

  const { error: mlUpdateError } = await supabase
    .from("masterlist")
    .update({
      outstanding_balance: newBalance,
      account_status: newBalance <= 0 ? "paid" : "active",
    })
    .eq("id", masterlistId);

  if (mlUpdateError) throw new Error(mlUpdateError.message);

  return {
    amount: remainingDue,
    scheduleId: amortizationScheduleId,
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
    .select("segment")
    .eq("id", masterlistId)
    .single();

  if (mlReadError || !masterlistRow) {
    throw new Error(
      mlReadError?.message ?? `Masterlist ${masterlistId} not found`,
    );
  }

  const { data: schedules } = await supabase
    .from("amortization_schedules")
    .select(
      "id, installment_no, due_date, status, amount_due, amount_paid, penalty_amount, rolled_at",
    )
    .eq("masterlist_id", masterlistId)
    .neq("status", "paid")
    .order("installment_no");

  const thresholds = await getAgingThresholds(supabase);

  // 'rolled' installments are frozen — their own balance was absorbed into
  // the next installment, so they're excluded from being "the overdue one".
  const overdue = (schedules ?? [])
    .filter((row) => row.status !== "rolled")
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
    const outstanding =
      Number(overdue.amount_due) -
      Number(overdue.amount_paid) +
      Number(overdue.penalty_amount ?? 0);
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
        .filter((row) => row.id !== overdue.id && row.status !== "rolled")
        .sort(
          (a, b) => (a.installment_no as number) - (b.installment_no as number),
        )[0];

      if (next) {
        const rollAmount = halfUp(
          Number(overdue.amount_due) -
            Number(overdue.amount_paid) +
            finalPenalty,
        );
        const now = new Date().toISOString();

        await supabase
          .from("amortization_schedules")
          .update({ amount_due: Number(next.amount_due) + rollAmount })
          .eq("id", next.id);

        await supabase
          .from("amortization_schedules")
          .update({
            status: "rolled",
            rolled_at: now,
            rolled_into_installment_no: next.installment_no,
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

  const remedialFlag = agingBucket === "91+";

  const masterlistUpdate: Record<string, unknown> = {
    aging_bucket: agingBucket,
    remedial_flag: remedialFlag,
  };
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

  const { error: deleteError } = await supabase
    .from("dcr_items")
    .delete()
    .eq("dcr_id", dcrId);

  if (deleteError) {
    throw new Error(deleteError.message);
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
    const { data: payment } = await supabase
      .from("payments")
      .select("id, masterlist_id, amount, status")
      .eq("id", item.payment_id)
      .single();

    if (!payment || payment.status === "posted") {
      continue;
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

    for (const line of allocationLines) {
      await supabase.from("postings").insert({
        dcr_id: dcrId,
        payment_id: payment.id,
        masterlist_id: payment.masterlist_id,
        amortization_schedule_id: line.amortizationScheduleId,
        amount: line.amount,
        posted_by: actorId,
        posted_at: now,
      });

      if (line.amortizationScheduleId) {
        const { data: schedule } = await supabase
          .from("amortization_schedules")
          .select("id, amount_due, amount_paid, penalty_amount, status")
          .eq("id", line.amortizationScheduleId)
          .single();

        if (schedule) {
          const totalDue =
            Number(schedule.amount_due) +
            Number(schedule.penalty_amount ?? 0);
          const newPaid =
            Number(schedule.amount_paid) + Number(line.amount);
          const paid = newPaid >= totalDue;

          await supabase
            .from("amortization_schedules")
            .update({
              amount_paid: newPaid,
              status: paid ? "paid" : "partial",
              paid_at: paid ? now : null,
            })
            .eq("id", schedule.id);
        }
      }
    }

    await supabase
      .from("payments")
      .update({
        status: "posted",
        reviewed_by: actorId,
        reviewed_at: now,
        flagged_reason: null,
        flagged_at: null,
      })
      .eq("id", payment.id);

    const { data: ml } = await supabase
      .from("masterlist")
      .select("outstanding_balance")
      .eq("id", payment.masterlist_id)
      .single();

    const newBalance = Math.max(
      0,
      halfUp(Number(ml?.outstanding_balance ?? 0) - Number(item.amount)),
    );

    await supabase
      .from("masterlist")
      .update({
        outstanding_balance: newBalance,
        account_status: newBalance <= 0 ? "paid" : "active",
      })
      .eq("id", payment.masterlist_id);
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

export async function addPaymentToDcr(
  supabase: SupabaseClient,
  dcrId: string,
  paymentId: string,
  collectorUserId: string,
  allocations?: AllocationLine[],
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

  const { data: dcrItem, error } = await supabase
    .from("dcr_items")
    .insert({
      dcr_id: dcrId,
      payment_id: paymentId,
      amount: payment.amount,
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
