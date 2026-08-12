import type { SupabaseClient } from "@supabase/supabase-js";

import { mapBorrowerRow, type BorrowerRow } from "@/lib/borrowers/types";
import { getActiveComputation } from "@/lib/csa/computation";
import { renderAndStore, type RenderedDocumentResult } from "@/lib/documents/render-store";
import { loadBlriContext } from "@/lib/lra/blri-data";
import { mapReleaseFileRow } from "@/lib/lra/blockers";
import { buildReleaseTemplateContext } from "@/lib/lra/template-context";
import type { ReleasePath } from "@/lib/lra/constants";

import { formatMoney } from "./shared";

/**
 * Generate the borrower Acknowledgement Receipt for a release file and store it
 * as a rendered_documents row (module = release_lra, linked to the release file).
 * Reuses the release merge context (isCheck/isCash, amountInWords, bank/check
 * fields) and adds `amountReleased` for this template's phrasing.
 */
export async function generateAcknowledgementReceipt(
  supabase: SupabaseClient,
  params: { releaseFileId: string; actorId: string },
): Promise<RenderedDocumentResult> {
  const { releaseFileId, actorId } = params;

  const { data: fileRow, error: fileError } = await supabase
    .from("release_files")
    .select("*")
    .eq("id", releaseFileId)
    .single();
  if (fileError || !fileRow) {
    throw new Error("Release file not found");
  }
  const file = mapReleaseFileRow(fileRow);

  if (!file.releasePath) {
    throw new Error("Release path must be selected first");
  }

  const computation = await getActiveComputation(supabase, file.loanApplicationId);
  if (!computation) {
    throw new Error("Computation not found");
  }

  const blri = await loadBlriContext(supabase, file.loanApplicationId, releaseFileId);

  const { data: app } = await supabase
    .from("loan_applications")
    .select("borrower_id, segment, borrowers (*)")
    .eq("id", file.loanApplicationId)
    .single();
  if (!app?.borrower_id) {
    throw new Error("Borrower not found");
  }

  const borrowerRaw = app.borrowers;
  const borrowerProfile = mapBorrowerRow(
    (Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw) as BorrowerRow,
  );

  const releasePath = file.releasePath as ReleasePath;
  const context = buildReleaseTemplateContext(
    blri,
    {
      netReleased: computation.netReleased,
      releaseDate: computation.releaseDate,
      addonMonths: computation.addonMonths,
      interestRate: computation.interestRate,
      loanTypeName: computation.loanTypeName,
      processingFee: computation.processingFee,
      securityFee: computation.securityFee,
      docStamp: computation.docStamp,
      adminCost: computation.adminCost,
      notaryFee: computation.notaryFee,
    },
    borrowerProfile,
    releasePath,
    { segment: app.segment === "sme" ? "sme" : "seafarer" },
  );

  // Template-specific alias for the released amount.
  context.amountReleased = formatMoney(computation.netReleased);

  return renderAndStore(supabase, {
    slug: "acknowledgement_receipt",
    module: "release_lra",
    applicationId: file.loanApplicationId,
    releaseFileId,
    context,
    actorId,
    // One acknowledgement per release; supersede a prior unsigned draft.
    replaceUnsigned: true,
  });
}
