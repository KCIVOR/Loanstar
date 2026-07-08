import { NextResponse } from "next/server";

import { appendStatusHistory } from "@/lib/applications/status";
import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  assertCsaCanEdit,
  getEndorseReadiness,
} from "@/lib/csa/application";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("intake", "execute_trigger");
    const { id } = await params;
    const supabase = await createClient();
    await assertCsaCanEdit(supabase, id);

    const readiness = await getEndorseReadiness(supabase, id);
    if (!readiness.ready) {
      return NextResponse.json(
        {
          error: "Cannot endorse — requirements not met",
          missing: readiness.missing,
        },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    await appendStatusHistory(supabase, id, "for_verification", {
      actorId: user.id,
      note: "Endorsed to CIG",
    });

    const { error: updateError } = await supabase
      .from("loan_applications")
      .update({
        endorsed_at: now,
        endorsed_by: user.id,
        blocker: null,
      })
      .eq("id", id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "intake",
      action: "execute_trigger",
      entityType: "loan_application",
      entityId: id,
      afterData: { trigger: "endorse_to_cig", status: "for_verification" },
    });

    return jsonOk({ success: true, status: "for_verification" });
  } catch (error) {
    return handleApiError(error);
  }
}
