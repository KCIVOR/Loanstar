import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { savePdcChecks } from "@/lib/lra/release-service";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const schema = z.object({
  checks: z.array(
    z.object({
      checkNumber: z.string().nullable().optional(),
      amount: z.number().positive(),
      checkDate: z.string(),
      bankName: z.string().min(1),
      refAccount: z.string().nullable().optional(),
    }),
  ),
  blankCheckFrom: z.string().optional(),
  blankCheckTo: z.string().optional(),
});

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("release_lra", "edit");
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

    const result = await savePdcChecks(
      supabase,
      releaseFile.id,
      body.checks,
      { from: body.blankCheckFrom, to: body.blankCheckTo },
      user.id,
    );

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "release_lra",
      action: "update",
      entityType: "pdc_checks",
      entityId: releaseFile.id,
      afterData: { count: body.checks.length },
    });

    return jsonOk(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
