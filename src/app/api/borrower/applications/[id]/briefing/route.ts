import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { signBriefingAsBorrower } from "@/lib/lra/release-service";
import {
  ForbiddenError,
  requireModulePermission,
} from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const signSchema = z.object({ confirm: z.literal(true) });

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

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("borrower_portal", "edit");
    const { id } = await params;
    signSchema.parse(await request.json());
    const { releaseFile } = await assertOwnReleaseBriefing(user.id, id);
    const supabase = await createClient();

    const result = await signBriefingAsBorrower(
      supabase,
      releaseFile.id,
      user.id,
    );

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "borrower_portal",
      action: "execute_trigger",
      entityType: "briefing",
      entityId: releaseFile.id,
      afterData: { trigger: "borrower_sign_briefing", ...result },
    });

    return jsonOk(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
