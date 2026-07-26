import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { initializeArAccount } from "@/lib/ar/masterlist";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ applicationId: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission(
      "accounting_ar",
      "execute_trigger",
    );
    const { applicationId } = await params;
    const supabase = await createClient();

    const { data: queueRow } = await supabase
      .from("ar_queue")
      .select("id, release_file_id, processed_at")
      .eq("loan_application_id", applicationId)
      .maybeSingle();

    if (!queueRow) {
      return NextResponse.json(
        { error: "Application is not in the AR queue" },
        { status: 400 },
      );
    }

    if (queueRow.processed_at) {
      return NextResponse.json(
        { error: "File already received — masterlist account exists" },
        { status: 400 },
      );
    }

    // Privileged initialization: reads release_files / computations, which AR
    // cannot SELECT under RLS (release_lra-scoped). Permission was verified
    // above; same pattern as queueForLra / discloseTerms.
    const result = await initializeArAccount(
      createServiceClient(),
      applicationId,
      queueRow.release_file_id as string,
      user.id,
    );

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "accounting_ar",
      action: "execute_trigger",
      entityType: "masterlist",
      entityId: result.masterlistId,
      afterData: {
        trigger: "ar_receive_file",
        applicationId,
        created: result.created,
      },
    });

    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
