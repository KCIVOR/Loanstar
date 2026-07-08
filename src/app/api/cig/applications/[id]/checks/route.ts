import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { assertCigVerificationStage } from "@/lib/cig/queue";
import { tryAutoForwardToCommittee } from "@/lib/cig/forward";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const checkSchema = z.object({
  checkTypeSlug: z.string().min(1),
  result: z.enum(["pass", "fail"]),
  notes: z.string().optional(),
  proofFileName: z.string().optional(),
  proofStoragePath: z.string().optional(),
  proofMimeType: z.string().optional(),
});

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireModulePermission("verification", "view");
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
      .eq("stage", "cig");

    if (mapError) {
      throw new Error(mapError.message);
    }

    const { data: recorded, error: recError } = await supabase
      .from("checks_recorded")
      .select("*")
      .eq("loan_application_id", id)
      .eq("stage", "cig");

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
        result: existing?.result ?? "pending",
        notes: existing?.notes ?? null,
        proofFileName: existing?.proof_file_name ?? null,
        checkedAt: existing?.checked_at ?? null,
      };
    });

    return jsonOk({ checks });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("verification", "edit");
    const { id } = await params;
    const body = checkSchema.parse(await request.json());
    const supabase = await createClient();
    await assertCigVerificationStage(supabase, id);

    const { data: checkType, error: typeError } = await supabase
      .from("check_types")
      .select("id, slug")
      .eq("slug", body.checkTypeSlug)
      .single();

    if (typeError || !checkType) {
      return NextResponse.json({ error: "Unknown check type" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("checks_recorded")
      .upsert(
        {
          loan_application_id: id,
          check_type_id: checkType.id,
          stage: "cig",
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
      moduleSlug: "verification",
      action: "update",
      entityType: "checks_recorded",
      entityId: data.id,
      afterData: {
        applicationId: id,
        slug: body.checkTypeSlug,
        result: body.result,
      },
    });

    const forward = await tryAutoForwardToCommittee(supabase, id, user.id);

    if (forward.forwarded) {
      await writeAuditEvent({
        actorId: user.id,
        moduleSlug: "verification",
        action: "execute_trigger",
        entityType: "loan_application",
        entityId: id,
        afterData: { trigger: "auto_forward_committee", status: "for_approval" },
      });
    }

    return jsonOk({
      check: {
        id: data.id,
        slug: body.checkTypeSlug,
        result: data.result,
        checkedAt: data.checked_at,
      },
      forwarded: forward.forwarded,
      missing: forward.missing,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}