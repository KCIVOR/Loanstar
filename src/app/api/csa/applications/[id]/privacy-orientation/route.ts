import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { assertCsaCanEdit } from "@/lib/csa/application";
import { recordPrivacyOrientation } from "@/lib/csa/privacy-orientation";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Record Data Privacy Act orientation given by CSA.
 * Permission: intake execute_trigger (same family as endorse).
 */
export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("intake", "execute_trigger");
    const { id } = await params;
    const supabase = await createClient();

    await assertCsaCanEdit(supabase, id);

    const result = await recordPrivacyOrientation(supabase, id, user.id);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "intake",
      action: "execute_trigger",
      entityType: "loan_application",
      entityId: id,
      afterData: {
        trigger: "privacy_orientation_given",
        applicationId: id,
        privacyOrientationAt: result.privacyOrientationAt,
        privacyOrientationBy: result.privacyOrientationBy,
        alreadyRecorded: result.alreadyRecorded,
      },
    });

    return jsonOk({
      privacyOrientationAt: result.privacyOrientationAt,
      privacyOrientationBy: result.privacyOrientationBy,
      alreadyRecorded: result.alreadyRecorded,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
