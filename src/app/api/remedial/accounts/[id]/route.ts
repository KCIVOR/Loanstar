import { handleApiError, jsonOk } from "@/lib/api/handler";
import { fetchAccountPostings } from "@/lib/collection/account-postings";
import { nextOpenInstallment, type ScheduleLite } from "@/lib/collector/desk";
import {
  ForbiddenError,
  requireModulePermission,
} from "@/lib/permissions/server";
import {
  remedialDaysPastDue,
  remedialSeverity,
} from "@/lib/remedial/desk";
import { createClient, createServiceClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

function asSchedules(raw: unknown): ScheduleLite[] {
  if (!raw) return [];
  const rows = Array.isArray(raw) ? raw : [raw];
  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      installment_no: Number(r.installment_no ?? 0),
      due_date: String(r.due_date ?? ""),
      amount_due: Number(r.amount_due ?? 0),
      status: String(r.status ?? "pending"),
      penalty_amount: Number(r.penalty_amount ?? 0),
      amount_paid: Number(r.amount_paid ?? 0),
    } as ScheduleLite & { amount_paid?: number };
  });
}

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
    const user = await requireModulePermission("remedial", "view");
    const { id } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("masterlist")
      .select(
        `
        *,
        assignments!inner (
          remedial_user_id,
          collector_user_id,
          remedial_assigned_at
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
        ),
        remedial_turnovers (
          id,
          from_collector_id,
          to_remedial_user_id,
          turnover_reason,
          confirmed_at,
          created_at
        )
      `,
      )
      .eq("id", id)
      .eq("assignments.remedial_user_id", user.id)
      .eq("remedial_flag", true)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new ForbiddenError("Account not found");

    const schedules = asSchedules(data.amortization_schedules);
    const next = nextOpenInstallment(schedules);
    const dpd = remedialDaysPastDue(schedules);
    const balance = Number(data.outstanding_balance ?? 0);
    const aging = String(data.aging_bucket ?? "");
    const severity = remedialSeverity({
      outstandingBalance: balance,
      daysPastDue: dpd,
      agingBucket: aging,
    });

    const turnovers = Array.isArray(data.remedial_turnovers)
      ? data.remedial_turnovers
      : data.remedial_turnovers
        ? [data.remedial_turnovers]
        : [];
    const latest = [...turnovers].sort((a, b) => {
      const at = String(
        (a as { confirmed_at?: string }).confirmed_at ??
          (a as { created_at?: string }).created_at ??
          "",
      );
      const bt = String(
        (b as { confirmed_at?: string }).confirmed_at ??
          (b as { created_at?: string }).created_at ??
          "",
      );
      return bt.localeCompare(at);
    })[0] as
      | {
          from_collector_id?: string | null;
          turnover_reason?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
        }
      | undefined;

    let fromCollectorName: string | null = null;
    if (latest?.from_collector_id) {
      const admin = createServiceClient();
      const { data: profile } = await admin
        .from("profiles")
        .select("full_name, email")
        .eq("id", latest.from_collector_id)
        .maybeSingle();
      fromCollectorName =
        (profile?.full_name as string) ||
        (profile?.email as string) ||
        "Collector";
    }

    const { data: payments } = await supabase
      .from("payments")
      .select(
        "id, reference_no, payment_date, amount, status, channel, notes, created_at, uploaded_by",
      )
      .eq("masterlist_id", id)
      .order("payment_date", { ascending: true });

    const uploaderIds = Array.from(
      new Set(
        (payments ?? [])
          .map((payment) => payment.uploaded_by as string | null)
          .filter((uploaderId): uploaderId is string => Boolean(uploaderId)),
      ),
    );
    const uploaderNameById = new Map<string, string>();
    if (uploaderIds.length > 0) {
      const admin = createServiceClient();
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", uploaderIds);
      for (const profile of profiles ?? []) {
        uploaderNameById.set(
          profile.id as string,
          (profile.full_name as string) || (profile.email as string),
        );
      }
    }
    const paymentsWithUploaderNames = (payments ?? []).map((payment) => ({
      ...payment,
      uploadedByName: payment.uploaded_by
        ? (uploaderNameById.get(payment.uploaded_by as string) ?? null)
        : null,
    }));

    // Remedial has no RLS grant on pdc_checks; scope a service-role read to
    // this account's release file so LRA check numbers reach the ledger.
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
        id: data.id,
        borrowerName: data.borrower_name,
        borrowerNo: data.borrower_no,
        borrowerId: (data.borrower_id as string | null) ?? null,
        loanAccountNo: data.loan_account_no,
        segment: data.segment === "sme" ? "sme" : "seafarer",
        manningAgency: (data.manning_agency as string | null) ?? null,
        vesselName: (data.vessel_name as string | null) ?? null,
        outstandingBalance: balance,
        agingBucket: aging,
        accountStatus: data.account_status,
        monthlyAmortization: Number(data.monthly_amortization ?? 0),
        principal: Number(data.principal ?? 0),
        totalLoan: Number(data.total_loan ?? 0),
        netReleased: Number(data.net_released ?? 0),
        daysPastDue: dpd,
        severity,
        nextDueDate: next?.due_date ?? null,
        nextDueAmount: next ? next.amount_due + next.penalty_amount : null,
        turnedOverAt:
          latest?.confirmed_at ??
          latest?.created_at ??
          null,
        turnoverReason: latest?.turnover_reason ?? "aging_91_plus",
        fromCollectorName,
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
      payments: paymentsWithUploaderNames,
      postings,
      pdcChecks,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
