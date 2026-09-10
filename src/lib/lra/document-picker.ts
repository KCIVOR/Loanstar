import type { SupabaseClient } from "@supabase/supabase-js";

import { createSignedDownloadUrl } from "@/lib/documents/storage";

import type { ReleasePath } from "./constants";
import {
  releaseDocumentCandidates,
  segmentGroup,
  type CollateralType,
  type PickerItem,
} from "./release-documents";
import { loadReleaseTemplateCatalog } from "./release-service";

/**
 * Builds the full (unfiltered, unpaginated) generate-modal picker for a loan:
 * every non-hidden, condition-matched release template for the loan's segment
 * group, joined to what's already been generated (with a fresh signed download
 * URL). `queryPickerItems` then applies search / filters / pagination.
 */
export async function buildReleaseDocumentPicker(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<{ mode: "curated" | "catalog"; items: PickerItem[] }> {
  const { data: app } = await supabase
    .from("loan_applications")
    .select("segment, collateral_type")
    .eq("id", applicationId)
    .single();

  const group = segmentGroup(
    app?.segment === "sme" || app?.segment === "individual"
      ? app.segment
      : "seafarer",
  );
  const mode = group === "seafarer" ? ("curated" as const) : ("catalog" as const);

  const { data: releaseRow } = await supabase
    .from("release_files")
    .select("id, release_paths")
    .eq("loan_application_id", applicationId)
    .maybeSingle();

  if (!releaseRow) {
    return { mode, items: [] };
  }

  const rawPaths: unknown[] = Array.isArray(releaseRow.release_paths)
    ? (releaseRow.release_paths as unknown[])
    : [];
  const releasePaths = rawPaths.filter(
    (p): p is ReleasePath => p === "with_pdc" || p === "without_pdc",
  );

  const [catalog, generatedRes] = await Promise.all([
    loadReleaseTemplateCatalog(supabase),
    supabase
      .from("generated_documents")
      .select("id, document_slug, storage_path, generated_at, signed_at, is_finalized")
      .eq("release_file_id", releaseRow.id),
  ]);

  const bySlug = new Map(
    (generatedRes.data ?? []).map((d) => [d.document_slug as string, d]),
  );

  const candidates = releaseDocumentCandidates(
    group,
    catalog,
    releasePaths,
    (app?.collateral_type as CollateralType) ?? null,
  );

  const items: PickerItem[] = await Promise.all(
    candidates.map(async (c) => {
      const g = bySlug.get(c.slug);
      return {
        slug: c.slug,
        name: c.name,
        eligibility: c.eligibility,
        canGenerate: c.canGenerate,
        generated: g
          ? {
              documentId: g.id as string,
              generatedAt: g.generated_at as string,
              signedAt: (g.signed_at as string | null) ?? null,
              isFinalized: Boolean(g.is_finalized),
              downloadUrl: g.storage_path
                ? await createSignedDownloadUrl(
                    supabase,
                    g.storage_path as string,
                  )
                : null,
            }
          : null,
      };
    }),
  );

  return { mode, items };
}
