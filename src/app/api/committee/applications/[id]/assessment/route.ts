import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  getCommitteeAssessment,
  saveCommitteeAssessment,
} from "@/lib/committee/assessment";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  characterNotes: z.string().nullable().optional(),
  capacityNotes: z.string().nullable().optional(),
  capitalNotes: z.string().nullable().optional(),
  conditionsNotes: z.string().nullable().optional(),
});

/** The 4 Cs (Character, Capacity, Capital, Conditions) — shared deliberation notes, not a decision gate. */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireModulePermission("committee", "view");
    const { id } = await params;
    const supabase = await createClient();
    const assessment = await getCommitteeAssessment(supabase, id);
    return jsonOk({ assessment });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("committee", "edit");
    const { id } = await params;
    const body = patchSchema.parse(await request.json());
    const supabase = await createClient();

    const assessment = await saveCommitteeAssessment(supabase, id, user.id, body);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "committee",
      action: "update",
      entityType: "committee_assessment",
      entityId: assessment.id,
      afterData: body,
    });

    return jsonOk({ assessment });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
