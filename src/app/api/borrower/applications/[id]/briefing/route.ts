import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  ForbiddenError,
  requireModulePermission,
} from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

async function assertOwnReleaseBriefing(userId: string, applicationId: string) {
  const supabase = await createClient();
  const { data: app } = await supabase
    .from("loan_applications")
    .select("id, borrowers!inner ( user_id )")
    .eq("id", applicationId)
    .single();

  if (!app) {
    throw new ForbiddenError("Application not found");
  }

  const borrowerRaw = app.borrowers;
  const borrower = Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw;
  if (borrower?.user_id !== userId) {
    throw new ForbiddenError("Application not found");
  }

  const { data: releaseFile } = await supabase
    .from("release_files")
    .select("id, status")
    .eq("loan_application_id", applicationId)
    .maybeSingle();

  if (!releaseFile) {
    throw new ForbiddenError("Release file not found");
  }

  const { data: briefing } = await supabase
    .from("briefings")
    .select("id, acknowledged_at, checklist")
    .eq("release_file_id", releaseFile.id)
    .maybeSingle();

  return { releaseFile, briefing };
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("borrower_portal", "view");
    const { id } = await params;
    const { releaseFile, briefing } = await assertOwnReleaseBriefing(
      user.id,
      id,
    );

    return jsonOk({
      releaseFile: {
        id: releaseFile.id,
        status: releaseFile.status,
      },
      briefing: briefing
        ? {
            acknowledgedAt: briefing.acknowledged_at,
            checklist: briefing.checklist,
          }
        : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
