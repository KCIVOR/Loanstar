import type { SupabaseClient } from "@supabase/supabase-js";

import { appendStatusHistory } from "@/lib/applications/status";

/**
 * Shared On Hold side effects used by Record hold and document request-revision.
 */
export async function recordApplicationHold(
  supabase: SupabaseClient,
  input: {
    applicationId: string;
    reason: string;
    actorId: string;
  },
): Promise<{ holdId: string }> {
  const { data: hold, error: holdError } = await supabase
    .from("file_holds")
    .insert({
      loan_application_id: input.applicationId,
      reason: input.reason,
      recorded_by: input.actorId,
    })
    .select("id")
    .single();

  if (holdError || !hold) {
    throw new Error(holdError?.message ?? "Failed to record hold");
  }

  await appendStatusHistory(supabase, input.applicationId, "on_hold", {
    actorId: input.actorId,
    note: input.reason,
  });

  const { error: blockerError } = await supabase
    .from("loan_applications")
    .update({ blocker: input.reason })
    .eq("id", input.applicationId);

  if (blockerError) {
    throw new Error(blockerError.message);
  }

  return { holdId: hold.id as string };
}
