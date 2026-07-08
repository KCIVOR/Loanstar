import { formatStatusLabel } from "@/lib/applications/status";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { getActiveComputation } from "@/lib/csa/computation";
import { createSignedDownloadUrl } from "@/lib/documents/storage";
import { loadBlriContext } from "@/lib/lra/blri-data";
import {
  getOrCreateReleaseFile,
} from "@/lib/lra/release-service";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireModulePermission("release_lra", "view");
    const { id } = await params;
    const supabase = await createClient();

    const { data: app } = await supabase
      .from("loan_applications")
      .select(
        `
        id,
        application_no,
        status,
        blocker,
        borrowers ( id, borrower_no, first_name, last_name, email )
      `,
      )
      .eq("id", id)
      .single();

    if (!app) {
      throw new Error("Application not found");
    }

    const { data: releaseRow } = await supabase
      .from("release_files")
      .select("*")
      .eq("loan_application_id", id)
      .maybeSingle();

    const { data: pdcChecks } = releaseRow
      ? await supabase
          .from("pdc_checks")
          .select("*")
          .eq("release_file_id", releaseRow.id)
          .order("sort_order")
      : { data: [] };

    const { data: generatedDocs } = releaseRow
      ? await supabase
          .from("generated_documents")
          .select("*")
          .eq("release_file_id", releaseRow.id)
          .order("document_slug")
      : { data: [] };

    const { data: briefing } = releaseRow
      ? await supabase
          .from("briefings")
          .select("*")
          .eq("release_file_id", releaseRow.id)
          .maybeSingle()
      : { data: null };

    const computation = await getActiveComputation(supabase, id);
    const blriPreview = await loadBlriContext(
      supabase,
      id,
      releaseRow?.id,
    ).catch(() => null);

    const borrowerRaw = app.borrowers;
    const borrower = Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw;

    const docsWithUrls = await Promise.all(
      (generatedDocs ?? []).map(async (doc) => ({
        id: doc.id,
        slug: doc.document_slug,
        signedAt: doc.signed_at,
        isFinalized: doc.is_finalized,
        downloadUrl: doc.storage_path
          ? await createSignedDownloadUrl(supabase, doc.storage_path as string)
          : null,
      })),
    );

    return jsonOk({
      application: {
        id: app.id,
        applicationNo: app.application_no,
        status: app.status,
        statusLabel: formatStatusLabel(app.status),
        blocker: app.blocker,
      },
      borrower,
      releaseFile: releaseRow,
      pdcChecks: pdcChecks ?? [],
      generatedDocuments: docsWithUrls,
      briefing,
      computation: computation
        ? {
            netReleased: computation.netReleased,
            principal: computation.principal,
            monthlyAmortization: computation.monthlyAmortization,
            terms: computation.terms,
          }
        : null,
      blriPreview,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("release_lra", "edit");
    const { id } = await params;
    const supabase = await createClient();
    const releaseFile = await getOrCreateReleaseFile(supabase, id, user.id);
    return jsonOk({ releaseFile });
  } catch (error) {
    return handleApiError(error);
  }
}
