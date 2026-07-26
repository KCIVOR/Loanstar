import { handleApiError, jsonOk } from "@/lib/api/handler";
import { nextOpenInstallment, type ScheduleLite } from "@/lib/collector/desk";
import { requireModulePermission } from "@/lib/permissions/server";
import {
  remedialDaysPastDue,
  remedialSeverity,
} from "@/lib/remedial/desk";
import { createClient, createServiceClient } from "@/lib/supabase/server";

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
    };
  });
}

export async function GET() {
  try {
    const user = await requireModulePermission("remedial", "view");
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("masterlist")
      .select(
        `
        id,
        borrower_name,
        borrower_no,
        loan_account_no,
        outstanding_balance,
        aging_bucket,
        account_status,
        monthly_amortization,
        principal,
        total_loan,
        updated_at,
        assignments!inner (
          remedial_user_id,
          collector_user_id,
          remedial_assigned_at
        ),
        amortization_schedules (
          installment_no,
          due_date,
          amount_due,
          amount_paid,
          status,
          penalty_amount
        ),
        remedial_turnovers (
          id,
          from_collector_id,
          turnover_reason,
          confirmed_at,
          created_at
        )
      `,
      )
      .eq("assignments.remedial_user_id", user.id)
      .eq("remedial_flag", true)
      .order("updated_at", { ascending: false });

    if (error) throw new Error(error.message);

    const collectorIds = new Set<string>();
    for (const row of data ?? []) {
      const turnovers = Array.isArray(row.remedial_turnovers)
        ? row.remedial_turnovers
        : row.remedial_turnovers
          ? [row.remedial_turnovers]
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
      })[0] as { from_collector_id?: string | null } | undefined;
      if (latest?.from_collector_id) {
        collectorIds.add(latest.from_collector_id);
      }
    }

    const nameById = new Map<string, string>();
    if (collectorIds.size) {
      const admin = createServiceClient();
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", [...collectorIds]);
      for (const p of profiles ?? []) {
        nameById.set(
          p.id as string,
          (p.full_name as string) || (p.email as string) || "Collector",
        );
      }
    }

    const accounts = (data ?? []).map((row) => {
      const schedules = asSchedules(row.amortization_schedules);
      const next = nextOpenInstallment(schedules);
      const dpd = remedialDaysPastDue(schedules);
      const balance = Number(row.outstanding_balance ?? 0);
      const aging = String(row.aging_bucket ?? "");
      const severity = remedialSeverity({
        outstandingBalance: balance,
        daysPastDue: dpd,
        agingBucket: aging,
      });

      const turnovers = Array.isArray(row.remedial_turnovers)
        ? row.remedial_turnovers
        : row.remedial_turnovers
          ? [row.remedial_turnovers]
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

      const assignmentRaw = row.assignments;
      const assignment = Array.isArray(assignmentRaw)
        ? assignmentRaw[0]
        : assignmentRaw;

      return {
        id: row.id,
        borrowerName: row.borrower_name,
        borrowerNo: row.borrower_no,
        loanAccountNo: row.loan_account_no,
        outstandingBalance: balance,
        agingBucket: aging,
        accountStatus: row.account_status,
        monthlyAmortization: Number(row.monthly_amortization ?? 0),
        daysPastDue: dpd,
        severity,
        nextDueDate: next?.due_date ?? null,
        nextDueAmount: next
          ? next.amount_due + next.penalty_amount
          : null,
        turnedOverAt:
          latest?.confirmed_at ??
          latest?.created_at ??
          (assignment as { remedial_assigned_at?: string } | null)
            ?.remedial_assigned_at ??
          null,
        turnoverReason: latest?.turnover_reason ?? "aging_91_plus",
        fromCollectorName: latest?.from_collector_id
          ? (nameById.get(latest.from_collector_id) ?? "Collector")
          : null,
      };
    });

    return jsonOk({ accounts });
  } catch (error) {
    return handleApiError(error);
  }
}
