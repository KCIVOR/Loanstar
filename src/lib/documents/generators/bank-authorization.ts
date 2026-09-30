import type { SupabaseClient } from "@supabase/supabase-js";

import { mapBorrowerRow, type BorrowerRow } from "@/lib/borrowers/types";
import { renderAndStore, type RenderedDocumentResult } from "@/lib/documents/render-store";
import { bankAuthorizationAccounts, looseDateLong } from "@/lib/lra/template-context";

/** SME / Individual Bank Authorization (client source: Step 1 - Processing-CSA). */
export const BANK_AUTHORIZATION_SLUG = "bank_authorization_sme";

/**
 * Merge context for printing the Bank Authorization at CSA. Same keys the
 * template binds in LRA (`buildReleaseTemplateContext`), except the date is
 * the day it is printed — there is no release date yet at intake.
 */
export function buildBankAuthorizationContext(
  borrower: Parameters<typeof bankAuthorizationAccounts>[0],
  today: Date,
): Record<string, unknown> {
  return {
    borrowerName: [borrower.firstName, borrower.lastName].filter(Boolean).join(" "),
    dateReleasedLong: looseDateLong(today.toISOString().slice(0, 10)),
    bankAuthorizationAccounts: bankAuthorizationAccounts(borrower),
  };
}

/** Print the Bank Authorization for an SME / Individual application (module = intake). */
export async function generateBankAuthorization(
  supabase: SupabaseClient,
  params: { applicationId: string; actorId: string },
): Promise<RenderedDocumentResult> {
  const { data: app, error } = await supabase
    .from("loan_applications")
    .select("segment, borrowers (*)")
    .eq("id", params.applicationId)
    .single();
  if (error || !app) throw new Error("Application not found");
  if (app.segment !== "sme" && app.segment !== "individual") {
    throw new Error("The Bank Authorization is for SME and Individual loans only");
  }

  const borrowerRaw = app.borrowers;
  const borrower = mapBorrowerRow(
    (Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw) as BorrowerRow,
  );

  return renderAndStore(supabase, {
    slug: BANK_AUTHORIZATION_SLUG,
    module: "intake",
    applicationId: params.applicationId,
    context: buildBankAuthorizationContext(borrower, new Date()),
    actorId: params.actorId,
    replaceUnsigned: true,
  });
}
