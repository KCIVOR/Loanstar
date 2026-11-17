import type { SupabaseClient } from "@supabase/supabase-js";

import { getOpenRevisitNotice } from "@/lib/committee/revisit-notices";
import { ForbiddenError } from "@/lib/permissions/server";

import { isCigEditableStage } from "./edit-stage";

/**
 * Server-only — split out of `lib/cig/queue.ts` because that module is
 * imported by the client `/cig` page for its pure types/constants, and
 * `ForbiddenError` pulls in `next/headers` via `lib/permissions/server`.
 */
export async function assertCigVerificationStage(
  supabase: SupabaseClient,
  applicationId: string,
) {
  const { data, error } = await supabase
    .from("loan_applications")
    .select("id, status")
    .eq("id", applicationId)
    .single();

  if (error || !data) {
    throw new ForbiddenError("Application not found");
  }

  if (data.status !== "for_verification") {
    throw new ForbiddenError("Application is not in verification stage");
  }

  return data;
}

/**
 * Guard for CIG edit routes (save verification, record checks). Same as
 * `assertCigVerificationStage`, but also allows editing while Committee has
 * returned the file to CIG. Forward, return, cancel and callback keep using
 * `assertCigVerificationStage`.
 */
export async function assertCigEditStage(
  supabase: SupabaseClient,
  applicationId: string,
) {
  const { data, error } = await supabase
    .from("loan_applications")
    .select("id, status")
    .eq("id", applicationId)
    .single();

  if (error || !data) {
    throw new ForbiddenError("Application not found");
  }

  const notice =
    data.status === "for_revision"
      ? await getOpenRevisitNotice(supabase, applicationId)
      : null;

  if (!isCigEditableStage(data.status as string, notice)) {
    throw new ForbiddenError("Application is not in verification stage");
  }

  return data;
}
