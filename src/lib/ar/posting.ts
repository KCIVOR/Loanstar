import type { SupabaseClient } from "@supabase/supabase-js";

import {
  calculatePenaltyAmount,
  computeAgingBucket,
  daysPastDue,
} from "@/lib/ar/schedule";
import { halfUp } from "@/lib/computation/money";

async function getPenaltyRate(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase
    .from("config_settings")
    .select("value")
    .eq("key", "penalty_rate")
    .maybeSingle();

  const raw = data?.value;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") return Number(raw);
  return 0.05;
}

export async function refreshMasterlistAging(
  supabase: SupabaseClient,
  masterlistId: string,
  asOf = new Date(),
) {
  const { data: schedules } = await supabase
    .from("amortization_schedules")
    .select("id, due_date, status, amount_due, amount_paid, penalty_amount")
    .eq("masterlist_id", masterlistId)
    .neq("status", "paid")
    .order("due_date");

  const overdue = (schedules ?? []).find((row) => {
    const due = row.due_date as string;
    return daysPastDue(due, asOf) > 0;
  });

  let agingBucket = "current" as ReturnType<typeof computeAgingBucket>;
  if (overdue) {
    agingBucket = computeAgingBucket(
      daysPastDue(overdue.due_date as string, asOf),
    );
  }

  const penaltyRate = await getPenaltyRate(supabase);

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

export async function reconcileAndPostDcr(
  supabase: SupabaseClient,
  dcrId: string,
  actorId: string,
  input: {
    depositReference: string;
    depositProofPath?: string | null;
  },
) {
  const { data: dcr } = await supabase
    .from("dcr")
    .select("id, status, collector_user_id")
    .eq("id", dcrId)
    .single();

  if (!dcr || dcr.status !== "submitted") {
    throw new Error("DCR must be submitted before reconciliation");
  }

  const { data: items } = await supabase
    .from("dcr_items")
    .select("id, payment_id, amount")
    .eq("dcr_id", dcrId);

  if (!items?.length) {
    throw new Error("DCR has no payment items");
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

    const { data: nextInstallment } = await supabase
      .from("amortization_schedules")
      .select("id, amount_due, amount_paid, penalty_amount, status")
      .eq("masterlist_id", payment.masterlist_id)
      .in("status", ["pending", "partial", "overdue"])
      .order("installment_no")
      .limit(1)
      .maybeSingle();

    await supabase.from("postings").insert({
      dcr_id: dcrId,
      payment_id: payment.id,
      masterlist_id: payment.masterlist_id,
      amortization_schedule_id: nextInstallment?.id ?? null,
      amount: item.amount,
      posted_by: actorId,
      posted_at: now,
    });

    await supabase
      .from("payments")
      .update({
        status: "posted",
        reviewed_by: actorId,
        reviewed_at: now,
      })
      .eq("id", payment.id);

    if (nextInstallment) {
      const totalDue =
        Number(nextInstallment.amount_due) +
        Number(nextInstallment.penalty_amount ?? 0);
      const newPaid = Number(nextInstallment.amount_paid) + Number(item.amount);
      const paid = newPaid >= totalDue;

      await supabase
        .from("amortization_schedules")
        .update({
          amount_paid: newPaid,
          status: paid ? "paid" : "partial",
          paid_at: paid ? now : null,
        })
        .eq("id", nextInstallment.id);
    }

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
    throw new Error("DCR not found");
  }

  if (dcr.status !== "draft") {
    throw new Error("DCR already submitted");
  }

  const { count } = await supabase
    .from("dcr_items")
    .select("id", { count: "exact", head: true })
    .eq("dcr_id", dcrId);

  if (!count) {
    throw new Error("Add at least one payment to the DCR");
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
    throw new Error(error?.message ?? "Failed to create DCR");
  }

  return { dcrId: data.id as string };
}

export async function addPaymentToDcr(
  supabase: SupabaseClient,
  dcrId: string,
  paymentId: string,
  collectorUserId: string,
) {
  const { data: dcr } = await supabase
    .from("dcr")
    .select("id, status, collector_user_id")
    .eq("id", dcrId)
    .single();

  if (!dcr || dcr.collector_user_id !== collectorUserId || dcr.status !== "draft") {
    throw new Error("DCR not editable");
  }

  const { data: payment } = await supabase
    .from("payments")
    .select("id, amount, status")
    .eq("id", paymentId)
    .single();

  if (!payment || !["pending_verification", "confirmed"].includes(payment.status as string)) {
    throw new Error("Payment not available for DCR");
  }

  const { error } = await supabase.from("dcr_items").insert({
    dcr_id: dcrId,
    payment_id: paymentId,
    amount: payment.amount,
  });

  if (error) {
    throw new Error(error.message);
  }
}
