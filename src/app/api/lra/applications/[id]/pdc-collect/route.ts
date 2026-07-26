import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { confirmPdcCollected } from "@/lib/lra/pdc-collect";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission(
      "release_lra",
      "execute_trigger",
    );
    const { id } = await params;
    const supabase = await createClient();

    const { data: releaseFile } = await supabase
      .from("release_files")
      .select("id")
      .eq("loan_application_id", id)
      .single();

    if (!releaseFile) {
      return NextResponse.json(
        { error: "Release file not found" },
        { status: 400 },
      );
    }

    const result = await confirmPdcCollected(
      supabase,
      releaseFile.id,
      user.id,
    );

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "release_lra",
      action: "execute_trigger",
      entityType: "release_file",
      entityId: releaseFile.id,
      afterData: {
        trigger: "pdc_physical_collect",
        pdcCollectedAt: result.pdcCollectedAt,
        pdcCollectedBy: result.pdcCollectedBy,
      },
    });

    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
