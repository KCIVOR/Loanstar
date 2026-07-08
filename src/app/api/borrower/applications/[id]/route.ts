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

type RouteParams = { params: Promise<{ id: string }> };

async function assertOwnApplication(userId: string, applicationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("loan_applications")
    .select(
      `
      id,
      application_no,
      status,
      status_history,
      blocker,
      is_reloan,
      parent_application_id,
      created_at,
      updated_at,
      borrowers!inner ( user_id )
    `,
    )
    .eq("id", applicationId)
    .single();

  if (error || !data) {
    throw new ForbiddenError("Application not found");
  }

  const borrowersRaw = data.borrowers;
  const borrower = Array.isArray(borrowersRaw) ? borrowersRaw[0] : borrowersRaw;

  if (borrower?.user_id !== userId) {
    throw new ForbiddenError("Application not found");
  }

  return data;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("borrower_portal", "view");
    const { id } = await params;
    const application = await assertOwnApplication(user.id, id);

    const timeline = ((application.status_history ?? []) as StatusHistoryEntry[]).map(
      (entry) => ({
        ...entry,
        label: formatStatusLabel(entry.status),
      }),
    );

    return jsonOk({
      application: {
        id: application.id,
        applicationNo: application.application_no,
        status: application.status,
        statusLabel: formatStatusLabel(application.status),
        statusHistory: application.status_history,
        timeline,
        blocker: application.blocker,
        isReloan: application.is_reloan,
        parentApplicationId: application.parent_application_id,
        createdAt: application.created_at,
        updatedAt: application.updated_at,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
