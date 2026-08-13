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
        "id, application_no, status, status_history, blocker, is_reloan, parent_application_id, created_at, updated_at, segment, entity_type",
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

    const applications = (data ?? []).map((app) => {
      const computation = computationByApp.get(app.id as string);
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
        loanAmount: computation ? Number(computation.principal) : null,
        loanTypeName: computation?.loan_type_name ?? null,
        termMonths: computation?.terms ?? null,
        interestRate: computation ? Number(computation.interest_rate) : null,
      };
    });

    return jsonOk({ applications });
  } catch (error) {
    return handleApiError(error);
  }
}
