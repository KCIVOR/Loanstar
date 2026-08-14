import type { SupabaseClient } from "@supabase/supabase-js";

import { appendStatusHistory } from "@/lib/applications/status";

/**
 * Shared cancel side effects: companion-table row + status history.
 * Does not touch `blocker`.
 */
export async function cancelApplication(
  supabase: SupabaseClient,
  input: {
    applicationId: string;
    reason: string;
    actorId: string;
  },
): Promise<{ cancellationId: string }> {
  const { data: cancellation, error: insertError } = await supabase
    .from("application_cancellations")
    .insert({
      loan_application_id: input.applicationId,
      reason: input.reason,
      cancelled_by: input.actorId,
    })
    .select("id")
    .single();

  if (insertError || !cancellation) {
    throw new Error(insertError?.message ?? "Failed to record cancellation");
  }

  await appendStatusHistory(supabase, input.applicationId, "cancelled", {
    actorId: input.actorId,
    note: input.reason,
  });

  return { cancellationId: cancellation.id as string };
}
