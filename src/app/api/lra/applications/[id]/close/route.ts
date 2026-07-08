import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { closeRelease } from "@/lib/lra/release-service";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const schema = z.object({
  signedVoucherDocumentId: z.string().uuid().optional(),
});

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("release_lra", "execute_trigger");
    const { id } = await params;
    const body = schema.parse(await request.json());
    const supabase = await createClient();

    const { data: releaseFile } = await supabase
      .from("release_files")
      .select("id")
      .eq("loan_application_id", id)
      .single();

    if (!releaseFile) {
      return NextResponse.json({ error: "Release file not found" }, { status: 400 });
    }

    const result = await closeRelease(
      supabase,
      releaseFile.id,
      user.id,
      body.signedVoucherDocumentId,
    );

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "release_lra",
      action: "execute_trigger",
      entityType: "release_file",
      entityId: releaseFile.id,
      afterData: { trigger: "close_release", ...result },
    });

    return jsonOk(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
