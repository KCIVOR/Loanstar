import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { assertCigVerificationStage } from "@/lib/cig/queue-guards";
import {
  assertChecksRecordingAllowed,
  CigSequenceError,
  getCigSequenceState,
} from "@/lib/cig/sequence";
import {
  getCigChecksComplete,
  getOrCreateVerification,
} from "@/lib/cig/verification";
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

    const { data: app, error: appError } = await supabase
      .from("loan_applications")
      .select("segment")
      .eq("id", id)
      .single();

    if (appError || !app) {
      throw new Error(appError?.message ?? "Application not found");
    }

    // Phase 7.1 provisional: CIG mappings remain Seafarer-only until client
    // confirms nfis/mf/lslg for SME — SME apps get an empty check list.
    // Individual has no mapping rows either (2026-08-19) — same empty-by-design
    // auto-pass, not a coercion into Seafarer's POEA/Marina checks.
    const segment =
      app.segment === "sme" || app.segment === "individual"
        ? app.segment
        : "seafarer";

    const { data: mappings, error: mapError } = await supabase
      .from("stage_check_mapping")
      .select(
        `
        stage,
        sort_order,
        check_types ( id, slug, name )
      `,
      )
      .eq("stage", "cig")
      .eq("segment", segment);

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

    const verification = await getOrCreateVerification(supabase, id);
    const checksBefore = await getCigChecksComplete(supabase, id);
    const { data: appRow } = await supabase
      .from("loan_applications")
      .select("segment, is_reloan")
      .eq("id", id)
      .maybeSingle();
    assertChecksRecordingAllowed(
      getCigSequenceState(verification, checksBefore.complete, {
        segment:
          appRow?.segment === "sme" || appRow?.segment === "individual"
            ? appRow.segment
            : "seafarer",
        isReloan: Boolean(appRow?.is_reloan),
      }),
    );

    const { data: checkType, error: typeError } = await supabase
      .from("check_types")
      .select("id, slug")
      .eq("slug", body.checkTypeSlug)
      .single();

    if (typeError || !checkType) {
      return NextResponse.json({ error: "Unknown check type" }, { status: 400 });
    }

    const segment =
      appRow?.segment === "sme" || appRow?.segment === "individual"
        ? appRow.segment
        : "seafarer";
    const { data: mapping, error: mapError } = await supabase
      .from("stage_check_mapping")
      .select("id")
      .eq("stage", "cig")
      .eq("segment", segment)
      .eq("check_type_id", checkType.id)
      .maybeSingle();

    if (mapError) {
      throw new Error(mapError.message);
    }
    if (!mapping) {
      return NextResponse.json(
        {
          error: `Check '${body.checkTypeSlug}' is not mapped for CIG/${segment}`,
        },
        { status: 400 },
      );
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

    return jsonOk({
      check: {
        id: data.id,
        slug: body.checkTypeSlug,
        result: data.result,
        checkedAt: data.checked_at,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof CigSequenceError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}