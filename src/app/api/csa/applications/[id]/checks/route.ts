import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { assertCsaCanEdit } from "@/lib/csa/application";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const checkSchema = z.object({
  result: z.enum(["pass", "fail"]),
  notes: z.string().optional(),
  proofFileName: z.string().optional(),
  proofStoragePath: z.string().optional(),
  proofMimeType: z.string().optional(),
});

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireModulePermission("intake", "view");
    const { id } = await params;
    const supabase = await createClient();

    const { data: mappings, error: mapError } = await supabase
      .from("stage_check_mapping")
      .select(
        `
        stage,
        sort_order,
        check_types ( id, slug, name )
      `,
      )
      .eq("stage", "csa");

    if (mapError) {
      throw new Error(mapError.message);
    }

    const { data: recorded, error: recError } = await supabase
      .from("checks_recorded")
      .select("*")
      .eq("loan_application_id", id);

    if (recError) {
      throw new Error(recError.message);
    }

    const recordedByType = new Map(
      (recorded ?? []).map((row) => [row.check_type_id as string, row]),
    );

    const checks = (mappings ?? []).map((row) => {
      const checkType = Array.isArray(row.check_types)
        ? row.check_types[0]
        : row.check_types;
      const existing = checkType
        ? recordedByType.get(checkType.id as string)
        : undefined;

      return {
        checkTypeId: checkType?.id ?? null,
        slug: checkType?.slug ?? null,
        name: checkType?.name ?? null,
        stage: row.stage,
        result: existing?.result ?? "pending",
        notes: existing?.notes ?? null,
        proofFileName: existing?.proof_file_name ?? null,
        proofStoragePath: existing?.proof_storage_path ?? null,
        checkedAt: existing?.checked_at ?? null,
        checkedBy: existing?.checked_by ?? null,
      };
    });

    return jsonOk({ checks });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("intake", "edit");
    const { id } = await params;
    const body = checkSchema.parse(await request.json());
    const supabase = await createClient();
    await assertCsaCanEdit(supabase, id);

    const { data: nclType, error: typeError } = await supabase
      .from("check_types")
      .select("id")
      .eq("slug", "ncl")
      .single();

    if (typeError || !nclType) {
      throw new Error("NCL check type not configured");
    }

    const { data, error } = await supabase
      .from("checks_recorded")
      .upsert(
        {
          loan_application_id: id,
          check_type_id: nclType.id,
          stage: "csa",
          result: body.result,
          notes: body.notes ?? null,
          proof_file_name: body.proofFileName ?? null,
          proof_storage_path: body.proofStoragePath ?? null,
          proof_mime_type: body.proofMimeType ?? null,
          checked_by: user.id,
          checked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "loan_application_id,check_type_id" },
      )
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "intake",
      action: "update",
      entityType: "checks_recorded",
      entityId: data.id,
      afterData: { applicationId: id, result: body.result, slug: "ncl" },
    });

    return jsonOk({
      check: {
        id: data.id,
        result: data.result,
        notes: data.notes,
        checkedAt: data.checked_at,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
