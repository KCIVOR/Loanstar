import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { markDenialInformed } from "@/lib/cig/denials";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * CIG confirms the courtesy denial call was made.
 * The written denial email is already sent on the committee Deny click
 * (Phase 4) — this endpoint is call tracking only.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("verification", "edit");
    const { id } = await params;
    const supabase = await createClient();

    const { noticeId } = await markDenialInformed(supabase, id, user.id);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "verification",
      action: "execute_trigger",
      entityType: "denial_notice",
      entityId: noticeId,
      afterData: { trigger: "cig_denial_informed", applicationId: id },
    });

    return jsonOk({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
