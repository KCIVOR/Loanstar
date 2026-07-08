import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { setReleasePath } from "@/lib/lra/release-service";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const schema = z
  .object({
    releasePath: z.enum(["with_pdc", "without_pdc"]),
    atmBankName: z.string().min(1).max(120).optional(),
    atmCardLast4: z.string().regex(/^\d{4}$/).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.releasePath === "without_pdc") {
      if (!value.atmBankName) {
        ctx.addIssue({
          code: "custom",
          message: "ATM bank name is required for Without PDC path",
          path: ["atmBankName"],
        });
      }
      if (!value.atmCardLast4) {
        ctx.addIssue({
          code: "custom",
          message: "ATM card last 4 digits are required for Without PDC path",
          path: ["atmCardLast4"],
        });
      }
    }
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
      return NextResponse.json(
        { error: "Start LRA processing first" },
        { status: 400 },
      );
    }

    const result = await setReleasePath(
      supabase,
      releaseFile.id,
      body.releasePath,
      user.id,
      {
        atmBankName: body.atmBankName,
        atmCardLast4: body.atmCardLast4,
      },
    );

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "release_lra",
      action: "update",
      entityType: "release_file",
      entityId: releaseFile.id,
      afterData: result,
    });

    return jsonOk(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
