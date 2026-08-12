import type { SupabaseClient } from "@supabase/supabase-js";

import { ForbiddenError } from "@/lib/permissions/server";

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
