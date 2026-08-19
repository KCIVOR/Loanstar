import { handleApiError, jsonOk } from "@/lib/api/handler";
import { fetchAccountPostings } from "@/lib/collection/account-postings";
import { COLLECTOR_QUEUE_ACCOUNT_STATUS } from "@/lib/collector/queue";
import {
  ForbiddenError,
  requireModulePermission,
} from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

async function fetchPdcChecks(scope: {
  releaseFileId: string | null;
  loanApplicationId: string | null;
}) {
  const admin = createServiceClient();
  let releaseFileId = scope.releaseFileId;
  if (!releaseFileId && scope.loanApplicationId) {
    const { data: releaseFile } = await admin
      .from("release_files")
      .select("id")
      .eq("loan_application_id", scope.loanApplicationId)
      .maybeSingle();
    releaseFileId = (releaseFile?.id as string | null) ?? null;
  }
  if (!releaseFileId) return [];

  const { data } = await admin
    .from("pdc_checks")
    .select("sort_order, check_number")
    .eq("release_file_id", releaseFileId)
    .order("sort_order", { ascending: true });
  return data ?? [];
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("collection", "view");
    const { id } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("masterlist")
      .select(
        `
        id,
        borrower_id,
        borrower_name,
        borrower_no,
        loan_account_no,
        loan_application_id,
        release_file_id,
        segment,
        outstanding_balance,
        account_status,
        total_loan,
        remedial_flag,
        assignments!inner (
          collector_user_id,
          remedial_user_id
        ),
        amortization_schedules (
          id,
          installment_no,
          due_date,
          amount_due,
          amount_paid,
          status,
          penalty_amount,
          paid_at
        )
      `,
      )
      .eq("id", id)
      .eq("assignments.collector_user_id", user.id)
      .is("assignments.remedial_user_id", null)
      .eq("remedial_flag", false)
      .eq("account_status", COLLECTOR_QUEUE_ACCOUNT_STATUS)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new ForbiddenError("Account not found");

    const { data: payments, error: paymentError } = await supabase
      .from("payments")
      .select(
        "id, reference_no, payment_date, amount, status, channel, notes, created_at",
      )
      .eq("masterlist_id", id)
      .order("payment_date", { ascending: true });
    if (paymentError) throw new Error(paymentError.message);

    const pdcChecks = await fetchPdcChecks({
      releaseFileId: (data.release_file_id as string | null) ?? null,
      loanApplicationId: (data.loan_application_id as string | null) ?? null,
    });
    const postings = await fetchAccountPostings(id);
    const scheduleRows = (
      Array.isArray(data.amortization_schedules)
        ? data.amortization_schedules
        : data.amortization_schedules
          ? [data.amortization_schedules]
          : []
    ) as Array<Record<string, unknown>>;

    return jsonOk({
      account: {
        id: data.id as string,
        borrowerName: data.borrower_name as string,
        borrowerNo: (data.borrower_no as string | null) ?? null,
        borrowerId: (data.borrower_id as string | null) ?? null,
        loanAccountNo: (data.loan_account_no as string | null) ?? null,
        segment:
          data.segment === "sme" || data.segment === "individual"
            ? data.segment
            : "seafarer",
        outstandingBalance: Number(data.outstanding_balance ?? 0),
        accountStatus: String(data.account_status ?? "active"),
        totalLoan: Number(data.total_loan ?? 0),
      },
      schedules: scheduleRows
        .map((row) => ({
          id: row.id as string,
          installmentNo: Number(row.installment_no ?? 0),
          dueDate: String(row.due_date ?? ""),
          amountDue: Number(row.amount_due ?? 0),
          amountPaid: Number(row.amount_paid ?? 0),
          penaltyAmount: Number(row.penalty_amount ?? 0),
          status: String(row.status ?? "pending"),
          paidAt: (row.paid_at as string | null) ?? null,
        }))
        .sort((a, b) => a.installmentNo - b.installmentNo),
      payments: payments ?? [],
      postings,
      pdcChecks,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
