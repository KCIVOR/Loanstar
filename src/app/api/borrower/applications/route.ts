import {
  formatStatusLabel,
  type StatusHistoryEntry,
} from "@/lib/applications/status";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  ForbiddenError,
  requireModulePermission,
} from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

async function getOwnBorrowerId(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("borrowers")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new ForbiddenError("Borrower profile not found");
  }

  return data.id as string;
}

export async function GET() {
  try {
    const user = await requireModulePermission("borrower_portal", "view");
    const supabase = await createClient();
    const borrowerId = await getOwnBorrowerId(user.id);

    const { data, error } = await supabase
      .from("loan_applications")
      .select(
        "id, application_no, status, status_history, blocker, is_reloan, parent_application_id, created_at, updated_at, segment, entity_type, collateral_type",
      )
      .eq("borrower_id", borrowerId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const applicationIds = (data ?? []).map((app) => app.id as string);
    const { data: computations } = applicationIds.length
      ? await supabase
          .from("computations")
          .select(
            "loan_application_id, principal, terms, interest_rate, loan_type_name",
          )
          .in("loan_application_id", applicationIds)
          .eq("is_active", true)
      : { data: [] };

    const computationByApp = new Map(
      (computations ?? []).map((c) => [c.loan_application_id as string, c]),
    );

    const { data: masterlistRows } = applicationIds.length
      ? await supabase
          .from("masterlist")
          .select(
            "loan_application_id, outstanding_balance, monthly_amortization, account_status, loan_account_no",
          )
          .in("loan_application_id", applicationIds)
      : { data: [] };

    const masterlistByApp = new Map(
      (masterlistRows ?? []).map((m) => [m.loan_application_id as string, m]),
    );

    const applications = (data ?? []).map((app) => {
      const computation = computationByApp.get(app.id as string);
      const masterlist = masterlistByApp.get(app.id as string);
      return {
        id: app.id,
        applicationNo: app.application_no,
        status: app.status,
        statusLabel: formatStatusLabel(app.status),
        statusHistory: (app.status_history ?? []) as StatusHistoryEntry[],
        blocker: app.blocker,
        isReloan: app.is_reloan,
        parentApplicationId: app.parent_application_id,
        createdAt: app.created_at,
        updatedAt: app.updated_at,
        segment: app.segment,
        entityType: app.entity_type,
        collateralType: (app.collateral_type as string | null) ?? "none",
        loanAmount: computation ? Number(computation.principal) : null,
        loanTypeName: computation?.loan_type_name ?? null,
        termMonths: computation?.terms ?? null,
        interestRate: computation ? Number(computation.interest_rate) : null,
        loanAccount: masterlist
          ? {
              outstanding: Number(masterlist.outstanding_balance ?? 0),
              monthly: Number(masterlist.monthly_amortization ?? 0),
              accountStatus: String(masterlist.account_status),
              loanAccountNo: (masterlist.loan_account_no as string | null) ?? null,
            }
          : null,
      };
    });

    return jsonOk({ applications });
  } catch (error) {
    return handleApiError(error);
  }
}
