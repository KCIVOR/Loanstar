import { NextResponse } from "next/server";

import { handleApiError, jsonOk } from "@/lib/api/handler";
import { computeAutoAllocation } from "@/lib/ar/posting";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    await requireModulePermission("collection", "view");
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
      .select("id, amount, masterlist_id")
      .eq("id", paymentId)
      .single();

    if (paymentError || !payment) {
      throw new Error(paymentError?.message ?? "Payment not found");
    }

    const { data: scheduleRows, error: scheduleError } = await supabase
      .from("amortization_schedules")
      .select(
        "id, installment_no, due_date, amount_due, penalty_amount, amount_paid, status",
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
      amountPaid: Number(row.amount_paid),
      status: row.status as "pending" | "partial" | "overdue",
    }));

    const allocation = computeAutoAllocation(
      Number(payment.amount),
      installments,
    );

    return jsonOk({ installments, allocation });
  } catch (error) {
    return handleApiError(error);
  }
}
