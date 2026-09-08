import { NextResponse } from "next/server";

import { daysPastDue } from "@/lib/ar/schedule";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { loadPendingAllocationsForAccount } from "@/lib/ar/duplicate-dcr";
import { computeAutoAllocation, deriveInterestPerRow } from "@/lib/ar/posting";
import {
  ForbiddenError,
  hasModulePermission,
  requireAuth,
} from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    const isCollector = await hasModulePermission(
      "collection",
      "view",
      user.id,
    );
    const isRemedial = await hasModulePermission("remedial", "view", user.id);
    if (!isCollector && !isRemedial) {
      throw new ForbiddenError(
        "Missing 'view' permission on module 'collection' or 'remedial'",
      );
    }
    const supabase = await createClient();

    const paymentId = new URL(request.url).searchParams.get("paymentId");
    if (!paymentId) {
      return NextResponse.json(
        { error: "paymentId query parameter is required" },
        { status: 400 },
      );
    }

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("id, amount, masterlist_id, move_of_payment_batch_id")
      .eq("id", paymentId)
      .single();

    if (paymentError || !payment) {
      throw new Error(paymentError?.message ?? "Payment not found");
    }

    // Fixes Plan Phase 3 (Issue 5) — a Move of Payment surcharge must not
    // pay down any installment. Default it to a single fully-unapplied line
    // so the pop-up opens with nothing pre-checked. The Collector can still
    // override in the modal.
    const isSurcharge = Boolean(payment.move_of_payment_batch_id);

    const { data: scheduleRows, error: scheduleError } = await supabase
      .from("amortization_schedules")
      .select(
        "id, installment_no, due_date, amount_due, penalty_amount, discount_amount, amount_paid, status",
      )
      .eq("masterlist_id", payment.masterlist_id)
      .in("status", ["pending", "partial", "overdue"])
      .order("installment_no");

    if (scheduleError) throw new Error(scheduleError.message);

    const installments = (scheduleRows ?? []).map((row) => ({
      id: row.id as string,
      installmentNo: row.installment_no as number,
      dueDate: row.due_date as string,
      amountDue: Number(row.amount_due),
      penaltyAmount: Number(row.penalty_amount ?? 0),
      discountAmount: Number(row.discount_amount ?? 0),
      amountPaid: Number(row.amount_paid),
      status: row.status as "pending" | "partial" | "overdue",
    }));

    const allocation = isSurcharge
      ? [{ amortizationScheduleId: null, amount: Number(payment.amount) }]
      : computeAutoAllocation(Number(payment.amount), installments);

    // Task 4 — how much of each installment is already spoken for by a
    // `pending` item on another unposted DCRR for this account, so the modal
    // can grey out / annotate those rows. Service-role (a prior assignee's
    // DCRR is invisible to this session's RLS) and throws on error.
    const pendingByInstallment = await loadPendingAllocationsForAccount(
      createServiceClient(),
      payment.masterlist_id as string,
    );

    // Collector Discount (Phase 2) — eligibility lists for the DCRR
    // discount UI (Phase 4). Uses the same daysPastDue/computeAgingBucket
    // boundary as every other overdue check in this codebase
    // (daysPastDue <= 0 = "current", due-today included) rather than a
    // freshly invented comparison, so an installment due exactly today is
    // treated identically here as it is everywhere else.
    const asOf = new Date();
    const interestEligibleBase = installments.filter(
      // Quarterly/Two-Monthly Special loans persist a $0 "principal"
      // placeholder row alongside every non-final period's real interest
      // row — excluded here so a collector never picks the non-real row for
      // an interest discount (which would silently waive nothing, while the
      // paired real interest row's obligation stays untouched).
      (inst) => daysPastDue(inst.dueDate, asOf) <= 0 && inst.amountDue > 0,
    );
    const penaltyEligible = installments.filter(
      (inst) =>
        daysPastDue(inst.dueDate, asOf) > 0 && inst.penaltyAmount > 0,
    );

    // interestPortion per installment isn't stored anywhere (amountDue is
    // principal+interest blended) — derive it the same way the existing
    // Offset-discount `activeLoans` path already does (totalInterest ÷
    // terms, halved for semi-monthly). Centralized in posting.ts (Phase 5)
    // so this route and the server-side discount re-validation share one
    // copy of the formula instead of two.
    const interestPerRow =
      interestEligibleBase.length > 0
        ? await deriveInterestPerRow(supabase, payment.masterlist_id as string)
        : 0;

    const interestEligible = interestEligibleBase.map((inst) => ({
      ...inst,
      interestPortion: interestPerRow,
    }));

    return jsonOk({
      installments,
      allocation,
      isSurcharge,
      interestEligible,
      penaltyEligible,
      pendingByInstallment,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
