import type { SupabaseClient } from "@supabase/supabase-js";

import { hashPdf, renderTemplateToPdf, type RenderContext } from "@/lib/documents/render";
import { createSignedDownloadUrl, uploadDocumentBytes } from "@/lib/documents/storage";
import { getPublishedTemplate } from "@/lib/documents/templates/service";

/**
 * Phase 5 — the general-purpose sibling of `generateReleaseDocuments`.
 *
 * Renders a published template for `slug` against `context` and stores the PDF
 * as a `rendered_documents` row keyed by the loan application (optionally a
 * release file). Usable from ANY stage — CSA, committee, LRA, AR, collection,
 * remedial — by passing the owning `module` (RLS gates writes against it).
 *
 * Unlike the release flow there is NO legacy fallback here: these are new,
 * template-only documents, so a missing published template is an explicit error.
 */
export type RenderAndStoreParams = {
  /** document_templates.slug to resolve the published body from. */
  slug: string;
  /** Owning module (e.g. 'collection'). RLS requires the caller to have edit on it. */
  module: string;
  /** The loan application this document belongs to (the storage/RLS spine). */
  applicationId: string;
  /** Merge context for the template body. */
  context: RenderContext;
  /** Optional release file this doc is tied to. */
  releaseFileId?: string | null;
  /** Optional actor recorded as generated_by. */
  actorId?: string | null;
  /**
   * When true, prior UNSIGNED rows for this (application, slug) are removed first
   * so a single-instance document (e.g. Final Computation Sheet) is superseded
   * rather than accumulating. Signed/finalized rows are always preserved.
   * Defaults to false (append — correct for a Demand Letter series).
   */
  replaceUnsigned?: boolean;
};

export type RenderedDocumentResult = {
  documentId: string;
  storagePath: string;
  contentHash: string;
  templateVersionId: string;
};

export async function renderAndStore(
  supabase: SupabaseClient,
  params: RenderAndStoreParams,
): Promise<RenderedDocumentResult> {
  const {
    slug,
    module,
    applicationId,
    context,
    releaseFileId = null,
    actorId = null,
    replaceUnsigned = false,
  } = params;

  const { data: app, error: appError } = await supabase
    .from("loan_applications")
    .select("borrower_id")
    .eq("id", applicationId)
    .single();

  if (appError || !app?.borrower_id) {
    throw new Error("Application borrower not found");
  }
  const borrowerId = app.borrower_id as string;

  const published = await getPublishedTemplate(supabase, slug);
  if (!published) {
    throw new Error(`No published template for document slug "${slug}"`);
  }

  const pdf = await renderTemplateToPdf(published.body, context);
  const contentHash = hashPdf(pdf);
  const docId = crypto.randomUUID();
  const storagePath = `${borrowerId}/rendered/${applicationId}/${slug}-${docId}.pdf`;

  await uploadDocumentBytes(supabase, storagePath, pdf, "application/pdf");

  if (replaceUnsigned) {
    // Supersede prior drafts of this exact document; never touch signed/finalized.
    const { error: delError } = await supabase
      .from("rendered_documents")
      .delete()
      .eq("loan_application_id", applicationId)
      .eq("document_slug", slug)
      .is("signed_at", null)
      .eq("is_finalized", false);
    if (delError) throw new Error(delError.message);
  }

  const { data: inserted, error: insertError } = await supabase
    .from("rendered_documents")
    .insert({
      loan_application_id: applicationId,
      release_file_id: releaseFileId,
      module,
      document_slug: slug,
      template_version_id: published.versionId,
      storage_path: storagePath,
      content_hash: contentHash,
      generated_by: actorId,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "Failed to record rendered document");
  }

  return {
    documentId: inserted.id as string,
    storagePath,
    contentHash,
    templateVersionId: published.versionId,
  };
}

export type RenderedDocument = {
  id: string;
  loanApplicationId: string;
  releaseFileId: string | null;
  module: string;
  documentSlug: string;
  templateVersionId: string | null;
  storagePath: string;
  contentHash: string;
  isFinalized: boolean;
  signedAt: string | null;
  generatedAt: string;
};

type RenderedDocumentRow = {
  id: string;
  loan_application_id: string;
  release_file_id: string | null;
  module: string;
  document_slug: string;
  template_version_id: string | null;
  storage_path: string;
  content_hash: string;
  is_finalized: boolean;
  signed_at: string | null;
  generated_at: string;
};

const RENDERED_COLS =
  "id, loan_application_id, release_file_id, module, document_slug, template_version_id, storage_path, content_hash, is_finalized, signed_at, generated_at";

function mapRenderedDocument(row: RenderedDocumentRow): RenderedDocument {
  return {
    id: row.id,
    loanApplicationId: row.loan_application_id,
    releaseFileId: row.release_file_id,
    module: row.module,
    documentSlug: row.document_slug,
    templateVersionId: row.template_version_id,
    storagePath: row.storage_path,
    contentHash: row.content_hash,
    isFinalized: row.is_finalized,
    signedAt: row.signed_at,
    generatedAt: row.generated_at,
  };
}

/** List rendered documents for an application (newest first), RLS-scoped. */
export async function listRenderedDocuments(
  supabase: SupabaseClient,
  applicationId: string,
  options?: { slug?: string },
): Promise<RenderedDocument[]> {
  let query = supabase
    .from("rendered_documents")
    .select(RENDERED_COLS)
    .eq("loan_application_id", applicationId)
    .order("generated_at", { ascending: false });

  if (options?.slug) {
    query = query.eq("document_slug", options.slug);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as RenderedDocumentRow[]).map(mapRenderedDocument);
}

/** Signed download URL for a rendered document's stored PDF. */
export async function getRenderedDocumentDownloadUrl(
  supabase: SupabaseClient,
  documentId: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const { data, error } = await supabase
    .from("rendered_documents")
    .select("storage_path")
    .eq("id", documentId)
    .single();

  if (error || !data) {
    throw new Error("Rendered document not found");
  }

  return createSignedDownloadUrl(
    supabase,
    data.storage_path as string,
    expiresInSeconds,
  );
}
