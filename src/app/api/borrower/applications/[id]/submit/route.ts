import { NextResponse } from "next/server";

import { appendStatusHistory } from "@/lib/applications/status";
import { writeAuditEvent } from "@/lib/audit/writer";
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
      status,
      borrower_id,
      segment,
      entity_type,
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

  return {
    id: data.id as string,
    status: data.status as string,
    borrowerId: data.borrower_id as string,
    segment: (data.segment === "sme" || data.segment === "individual"
      ? data.segment
      : "seafarer") as "seafarer" | "sme" | "individual",
    entityType:
      data.entity_type === "individual" || data.entity_type === "corporate"
        ? (data.entity_type as "individual" | "corporate")
        : null,
  };
}

/** Borrower submits their draft — flips it to documents_pending, the first
 * status CSA's queue picks up. No longer gated on document completeness; CSA
 * follows up on missing docs after intake. */
export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("borrower_portal", "edit");
    const { id } = await params;
    const supabase = await createClient();
    const application = await assertOwnApplication(user.id, id);

    if (application.status !== "draft") {
      return NextResponse.json(
        { error: "This application has already been submitted." },
        { status: 400 },
      );
    }

    await appendStatusHistory(supabase, application.id, "documents_pending", {
      actorId: user.id,
      note: "Submitted by borrower",
    });

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "borrower_portal",
      action: "update",
      entityType: "loan_application",
      entityId: application.id,
      beforeData: { status: "draft" },
      afterData: { status: "documents_pending" },
    });

    return jsonOk({ id: application.id, status: "documents_pending" });
  } catch (error) {
    return handleApiError(error);
  }
}
