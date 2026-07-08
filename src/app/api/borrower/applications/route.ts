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
        "id, application_no, status, status_history, blocker, is_reloan, parent_application_id, created_at, updated_at",
      )
      .eq("borrower_id", borrowerId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const applications = (data ?? []).map((app) => ({
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
    }));

    return jsonOk({ applications });
  } catch (error) {
    return handleApiError(error);
  }
}
