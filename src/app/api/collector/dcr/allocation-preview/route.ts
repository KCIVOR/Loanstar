import { NextResponse } from "next/server";

import { handleApiError, jsonOk } from "@/lib/api/handler";
import { computeAutoAllocation } from "@/lib/ar/posting";
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

    return jsonOk({ installments, allocation, isSurcharge });
  } catch (error) {
    return handleApiError(error);
  }
}
