import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { setReleasePaths } from "@/lib/lra/release-service";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const schema = z
  .object({
    releasePaths: z
      .array(z.enum(["with_pdc", "without_pdc"]))
      .min(1)
      .max(2)
      .refine(
        (paths) => new Set(paths).size === paths.length,
        "Duplicate release paths are not allowed",
      ),
    atmBankName: z.string().min(1).max(120).optional(),
    atmCardLast4: z.string().regex(/^\d{4}$/).optional(),
    atmAccountNumber: z.string().min(1).max(64).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.releasePaths.includes("without_pdc")) {
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
      if (!value.atmAccountNumber) {
        ctx.addIssue({
          code: "custom",
          message: "ATM account number is required for Without PDC path",
          path: ["atmAccountNumber"],
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

    const result = await setReleasePaths(
      supabase,
      releaseFile.id,
      body.releasePaths,
      user.id,
      {
        atmBankName: body.atmBankName,
        atmCardLast4: body.atmCardLast4,
        atmAccountNumber: body.atmAccountNumber,
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
