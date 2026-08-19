import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  ensureDocumentSlots,
  getCompletionSummary,
  getStageChecklist,
  type ChecklistItem,
} from "@/lib/documents/checklist";
import { STAGES } from "@/lib/constants";
import {
  releaseStagesForPaths,
  type ReleasePath,
} from "@/lib/lra/constants";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

function isReleasePath(value: unknown): value is ReleasePath {
  return value === "with_pdc" || value === "without_pdc";
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    await requireModulePermission("release_lra", "view");
    const { id } = await params;
    const supabase = await createClient();
    const url = new URL(request.url);
    const requestedStage = url.searchParams.get("stage");

    const { data: app } = await supabase
      .from("loan_applications")
      .select("borrower_id, segment, entity_type")
      .eq("id", id)
      .single();

    if (!app?.borrower_id) {
      throw new Error("Application not found");
    }

    const scope = {
      segment: (app.segment === "sme" || app.segment === "individual"
        ? app.segment
        : "seafarer") as "seafarer" | "sme" | "individual",
      entityType:
        app.entity_type === "individual" || app.entity_type === "corporate"
          ? (app.entity_type as "individual" | "corporate")
          : null,
    };

    const { data: releaseFile } = await supabase
      .from("release_files")
      .select("release_paths")
      .eq("loan_application_id", id)
      .maybeSingle();

    const paths = (
      Array.isArray(releaseFile?.release_paths) ? releaseFile.release_paths : []
    ).filter(isReleasePath);
    const applicableStages = releaseStagesForPaths(paths);

    let stage = requestedStage ?? "release";

    if (!requestedStage) {
      if (applicableStages.length === 1) {
        stage = applicableStages[0]!;
      } else if (applicableStages.length > 1) {
        // Both paths selected — ensure + return docs from every applicable stage.
        for (const s of applicableStages) {
          await ensureDocumentSlots(
            supabase,
            s,
            id,
            app.borrower_id as string,
            scope,
          );
        }
        const itemArrays = await Promise.all(
          applicableStages.map((s) =>
            getStageChecklist(supabase, s, id, scope),
          ),
        );
        const seen = new Set<string>();
        const items: ChecklistItem[] = [];
        for (const arr of itemArrays) {
          for (const item of arr) {
            const key = `${item.documentTypeId}:${item.stage}`;
            if (seen.has(key)) continue;
            seen.add(key);
            items.push(item);
          }
        }
        const summary = getCompletionSummary(items);
        return jsonOk({ stage: applicableStages[0], stages: applicableStages, items, summary });
      }
    } else if (
      applicableStages.length > 0 &&
      (requestedStage === "signing_with_pdc" ||
        requestedStage === "signing_without_pdc") &&
      !applicableStages.includes(requestedStage)
    ) {
      // Document belongs only if its stage matches ANY selected path's stage.
      throw new Error("Invalid checklist stage for selected release paths");
    }

    if (!STAGES.includes(stage as (typeof STAGES)[number])) {
      throw new Error("Invalid checklist stage");
    }

    await ensureDocumentSlots(
      supabase,
      stage,
      id,
      app.borrower_id as string,
      scope,
    );

    const items = await getStageChecklist(supabase, stage, id, scope);
    const summary = getCompletionSummary(items);

    return jsonOk({ stage, items, summary });
  } catch (error) {
    return handleApiError(error);
  }
}
