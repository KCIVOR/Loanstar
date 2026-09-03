import { NextResponse } from "next/server";

import { daysPastDue } from "@/lib/ar/schedule";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { computeAutoAllocation } from "@/lib/ar/posting";
import { halfUp } from "@/lib/computation/money";
import {
  ForbiddenError,
  hasModulePermission,
  requireAuth,
} from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

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

    // Collector Discount (Phase 2) — eligibility lists for the DCRR
    // discount UI (Phase 4). Uses the same daysPastDue/computeAgingBucket
    // boundary as every other overdue check in this codebase
    // (daysPastDue <= 0 = "current", due-today included) rather than a
    // freshly invented comparison, so an installment due exactly today is
    // treated identically here as it is everywhere else.
    const asOf = new Date();
    const interestEligibleBase = installments.filter(
      (inst) => daysPastDue(inst.dueDate, asOf) <= 0,
    );
    const penaltyEligible = installments.filter(
      (inst) =>
        daysPastDue(inst.dueDate, asOf) > 0 && inst.penaltyAmount > 0,
    );

    // interestPortion per installment isn't stored anywhere (amountDue is
    // principal+interest blended) — derive it the same way the existing
    // Offset-discount `activeLoans` path already does (confirmed by
    // reading src/app/api/csa/applications/[id]/computation/route.ts
    // directly): totalInterest ÷ terms, halved again for semi-monthly.
    // Deliberately reuses plain total_interest, not gross_total_interest —
    // matching that same precedent exactly, not improving on it here.
    let interestPerRow = 0;
    if (interestEligibleBase.length > 0) {
      const { data: masterlistRow } = await supabase
        .from("masterlist")
        .select("computation_id")
        .eq("id", payment.masterlist_id)
        .single();

      const computationId = masterlistRow?.computation_id as string | null;
      if (computationId) {
        const { data: computationRow } = await supabase
          .from("computations")
          .select("total_interest, terms, payment_frequency")
          .eq("id", computationId)
          .single();

        if (computationRow) {
          const terms = Number(computationRow.terms) || 1;
          const interestPerMonth = halfUp(
            Number(computationRow.total_interest) / terms,
          );
          interestPerRow =
            computationRow.payment_frequency === "semi_monthly"
              ? halfUp(interestPerMonth / 2)
              : interestPerMonth;
        }
      }
    }

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
    });
  } catch (error) {
    return handleApiError(error);
  }
}
