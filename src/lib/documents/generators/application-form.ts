import type { SupabaseClient } from "@supabase/supabase-js";

import { mapBorrowerRow, type BorrowerRow } from "@/lib/borrowers/types";
import { getActiveComputation } from "@/lib/csa/computation";
import { renderAndStore, type RenderedDocumentResult } from "@/lib/documents/render-store";

import {
  buildApplicationFormContext,
  resolveApplicationFormSlug,
  type ApplicationFormSlug,
} from "./application-form-context";

export type GenerateApplicationFormResult = RenderedDocumentResult & {
  documentSlug: ApplicationFormSlug;
};

/**
 * Generate the printable Loan Application Form for an application and store it
 * as a rendered_documents row (module = intake). Slug is segment-aware:
 * Seafarer → `application_form`; SME Individual/Corporate → dedicated templates.
 * replaceUnsigned keeps one live printout per (application, slug).
 */
export async function generateApplicationForm(
  supabase: SupabaseClient,
  params: { applicationId: string; actorId: string },
): Promise<GenerateApplicationFormResult> {
  const { applicationId, actorId } = params;

  const { data: app, error } = await supabase
    .from("loan_applications")
    .select("application_no, created_at, segment, entity_type, borrowers (*)")
    .eq("id", applicationId)
    .single();
  if (error || !app) throw new Error("Application not found");

  const resolved = resolveApplicationFormSlug({
    segment: app.segment,
    entityType: app.entity_type,
  });
  if (!resolved.ok) {
    throw new Error(resolved.error);
  }

  const borrowerRaw = app.borrowers;
  const borrower = mapBorrowerRow(
    (Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw) as BorrowerRow,
  );

  const computation = await getActiveComputation(supabase, applicationId);

  const context = buildApplicationFormContext({
    segment: app.segment,
    entityType: app.entity_type,
    applicationNo: app.application_no as string | null,
    applicationCreatedAt: app.created_at as string | null,
    profile: borrower,
    computation,
  });

  const result = await renderAndStore(supabase, {
    slug: resolved.slug,
    module: "intake",
    applicationId,
    context,
    actorId,
    replaceUnsigned: true,
  });

  return { ...result, documentSlug: resolved.slug };
}
