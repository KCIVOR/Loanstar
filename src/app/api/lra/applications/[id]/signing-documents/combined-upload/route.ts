import { NextResponse } from "next/server";
import { z } from "zod";
import type { User } from "@supabase/supabase-js";

import { resolveDisplayName } from "@/lib/account/display-name";
import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { getStageChecklist } from "@/lib/documents/checklist";
import {
  resolveCombinedUploadTargets,
  type CombinedUploadTarget,
} from "@/lib/lra/combined-signing-upload";
import {
  releaseStagesForPaths,
  type ReleasePath,
} from "@/lib/lra/constants";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type RouteParams = { params: Promise<{ id: string }> };

const combinedUploadSchema = z.object({
  storagePath: z.string().min(1),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  fileSize: z.number().int().positive().max(10_485_760),
  remarks: z.string().trim().max(2000).optional(),
});

function isReleasePath(value: unknown): value is ReleasePath {
  return value === "with_pdc" || value === "without_pdc";
}

async function resolveUploaderName(
  supabase: SupabaseClient,
  userId: string,
  authUser?: User,
): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();

  return resolveDisplayName(
    profile?.full_name as string | null | undefined,
    authUser?.user_metadata?.full_name as string | undefined,
    (profile?.email as string | null | undefined) ?? authUser?.email,
  );
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("release_lra", "edit");
    const { id } = await params;
    const body = combinedUploadSchema.parse(await request.json());
    const supabase = await createClient();
    const remarks = body.remarks?.trim() || null;

    const { data: app, error: appError } = await supabase
      .from("loan_applications")
      .select("id, borrower_id, segment, entity_type")
      .eq("id", id)
      .single();

    if (appError || !app?.borrower_id) {
      throw new Error("Application not found");
    }

    const { data: releaseFile, error: releaseError } = await supabase
      .from("release_files")
      .select("release_paths")
      .eq("loan_application_id", id)
      .maybeSingle();

    if (releaseError) throw new Error(releaseError.message);

    const releasePathsRaw = releaseFile?.release_paths;
    const releasePaths = (
      Array.isArray(releasePathsRaw) ? releasePathsRaw : []
    ).filter(isReleasePath);

    if (
      releasePaths.length === 0 ||
      (Array.isArray(releasePathsRaw) &&
        releasePathsRaw.some((p) => !isReleasePath(p)))
    ) {
      return NextResponse.json(
        { error: "Release path must be selected first" },
        { status: 400 },
      );
    }

    // Route already tags each target by its checklist stage (signing_* vs
    // release). For dual paths, gather required docs from every applicable
    // signing stage and tag each with that stage — no UI stage-pick needed.
    const signingStages = releaseStagesForPaths(releasePaths);
    const scope = {
      segment: (app.segment === "sme" ? "sme" : "seafarer") as "seafarer" | "sme",
      entityType:
        app.entity_type === "individual" || app.entity_type === "corporate"
          ? (app.entity_type as "individual" | "corporate")
          : null,
    };

    const [signingItemArrays, releaseItems] = await Promise.all([
      Promise.all(
        signingStages.map((signingStage) =>
          getStageChecklist(supabase, signingStage, id, scope),
        ),
      ),
      getStageChecklist(supabase, "release", id, scope),
    ]);

    const targetsByKey = new Map<string, CombinedUploadTarget>();
    for (let i = 0; i < signingStages.length; i++) {
      const signingStage = signingStages[i]!;
      const signingItems = signingItemArrays[i] ?? [];
      for (const target of resolveCombinedUploadTargets(
        signingItems,
        [],
        signingStage,
      )) {
        targetsByKey.set(`${target.documentTypeId}:${target.stage}`, target);
      }
    }
    for (const target of resolveCombinedUploadTargets(
      [],
      releaseItems,
      signingStages[0]!,
    )) {
      targetsByKey.set(`${target.documentTypeId}:${target.stage}`, target);
    }
    const targets = Array.from(targetsByKey.values());

    const written: Array<{
      id: string;
      document_type_id: string;
      stage: string;
      status: string;
      file_name: string | null;
    }> = [];

    for (const target of targets) {
      const { data: existingDoc, error: fetchError } = await supabase
        .from("documents")
        .select("id, status")
        .eq("loan_application_id", app.id)
        .eq("document_type_id", target.documentTypeId)
        .eq("stage", target.stage)
        .maybeSingle();

      if (fetchError) throw new Error(fetchError.message);

      let documentId = existingDoc?.id as string | undefined;

      if (!documentId) {
        const { data: created, error: createError } = await supabase
          .from("documents")
          .insert({
            borrower_id: app.borrower_id,
            loan_application_id: app.id,
            document_type_id: target.documentTypeId,
            stage: target.stage,
            status: "pending",
          })
          .select("id")
          .single();

        if (createError || !created) {
          throw new Error(
            createError?.message ?? "Failed to create document slot",
          );
        }
        documentId = created.id;
      }

      if (!documentId) {
        throw new Error("Failed to resolve document slot");
      }

      const { data: updated, error: updateError } = await supabase
        .from("documents")
        .update({
          storage_path: body.storagePath,
          file_name: body.fileName,
          mime_type: body.mimeType,
          file_size: body.fileSize,
          status: "uploaded",
          uploaded_by: user.id,
        })
        .eq("id", documentId)
        .select("id, document_type_id, stage, status, file_name")
        .single();

      if (updateError || !updated) {
        throw new Error(
          updateError?.message ?? "Failed to update document metadata",
        );
      }

      await writeAuditEvent({
        actorId: user.id,
        moduleSlug: "release_lra",
        action: "update",
        entityType: "document",
        entityId: updated.id,
        afterData: {
          applicationId: app.id,
          documentTypeId: target.documentTypeId,
          documentTypeSlug: target.documentTypeSlug,
          stage: target.stage,
          fileName: body.fileName,
          status: "uploaded",
          combinedUpload: true,
        },
      });

      written.push(updated);
    }

    const { data: logRow, error: logError } = await supabase
      .from("lra_combined_signing_uploads")
      .insert({
        loan_application_id: id,
        storage_path: body.storagePath,
        file_name: body.fileName,
        mime_type: body.mimeType,
        file_size: body.fileSize,
        remarks,
        document_ids: written.map((w) => w.id),
        uploaded_by: user.id,
      })
      .select("id, uploaded_at")
      .single();

    if (logError || !logRow) {
      throw new Error(logError?.message ?? "Failed to log combined upload");
    }

    const uploadedByName = await resolveUploaderName(supabase, user.id, user);

    return jsonOk({
      documents: written,
      count: written.length,
      upload: {
        id: logRow.id,
        fileName: body.fileName,
        remarks,
        uploadedAt: logRow.uploaded_at,
        uploadedByName,
        viewDocumentId: written[0]?.id ?? null,
        count: written.length,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireModulePermission("release_lra", "view");
    const { id } = await params;
    const supabase = await createClient();

    const { data: logRow, error } = await supabase
      .from("lra_combined_signing_uploads")
      .select(
        "id, file_name, remarks, uploaded_at, uploaded_by, document_ids",
      )
      .eq("loan_application_id", id)
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);

    if (!logRow) {
      return jsonOk({ upload: null });
    }

    const uploadedByName = await resolveUploaderName(
      supabase,
      logRow.uploaded_by as string,
    );
    const documentIds = (logRow.document_ids as string[] | null) ?? [];

    return jsonOk({
      upload: {
        id: logRow.id,
        fileName: logRow.file_name,
        remarks: (logRow.remarks as string | null) ?? null,
        uploadedAt: logRow.uploaded_at,
        uploadedByName,
        viewDocumentId: documentIds[0] ?? null,
        count: documentIds.length,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
