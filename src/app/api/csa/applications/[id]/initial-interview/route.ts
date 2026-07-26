import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { assertCsaCanEdit } from "@/lib/csa/application";
import { assessApplicationFormCompleteness } from "@/lib/csa/application-form-completeness";
import {
  assertCanRecordInitialInterview,
  listInterviewRecordPrerequisites,
  recordInitialInterview,
} from "@/lib/csa/initial-interview";
import {
  mapBorrowerRow,
  type BorrowerRow,
} from "@/lib/borrowers/types";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const schema = z.object({
  notes: z.string(),
});

async function isNclRecorded(
  supabase: Awaited<ReturnType<typeof createClient>>,
  applicationId: string,
): Promise<boolean> {
  const { data: nclType } = await supabase
    .from("check_types")
    .select("id")
    .eq("slug", "ncl")
    .single();
  if (!nclType?.id) return false;
  const { data: nclCheck } = await supabase
    .from("checks_recorded")
    .select("result")
    .eq("loan_application_id", applicationId)
    .eq("check_type_id", nclType.id)
    .maybeSingle();
  return nclCheck?.result === "pass" || nclCheck?.result === "fail";
}

/**
 * Record CSA initial interview notes + confirm.
 * Permission: intake execute_trigger (same family as endorse / orientation).
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("intake", "execute_trigger");
    const { id } = await params;
    const body = schema.parse(await request.json());
    const supabase = await createClient();

    const application = await assertCsaCanEdit(supabase, id);
    const borrowerRaw = application.borrowers;
    const borrowerRow = (
      Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw
    ) as BorrowerRow | null;
    const formCompleteness = assessApplicationFormCompleteness(
      borrowerRow ? mapBorrowerRow(borrowerRow) : null,
    );
    const nclRecorded = await isNclRecorded(supabase, id);

    try {
      assertCanRecordInitialInterview({
        privacyOrientationAt:
          (application.privacy_orientation_at as string | null) ?? null,
        formCompleteness,
        nclRecorded,
        notes: body.notes,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Prerequisites not met";
      const missing = message
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      // Also expose structured prereqs without notes for UI clarity
      const prereqs = listInterviewRecordPrerequisites({
        privacyOrientationAt:
          (application.privacy_orientation_at as string | null) ?? null,
        formCompleteness,
        nclRecorded,
      });
      return NextResponse.json(
        {
          error: "Cannot record initial interview — requirements not met",
          missing: missing.length > 0 ? missing : prereqs,
        },
        { status: 400 },
      );
    }

    const result = await recordInitialInterview(
      supabase,
      id,
      user.id,
      body.notes,
    );

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "intake",
      action: "execute_trigger",
      entityType: "loan_application",
      entityId: id,
      afterData: {
        trigger: "initial_interview_recorded",
        applicationId: id,
        alreadyRecorded: result.alreadyRecorded,
      },
    });

    return jsonOk(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
