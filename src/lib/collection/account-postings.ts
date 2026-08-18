import type { DeskLedgerPosting } from "@/lib/ledger/desk-ledger";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Remedial has no RLS grant on `postings`, so both desks read them with a
 * service client scoped to a single masterlist the caller is already assigned
 * to. Without this the ledger cannot tell which installment a credit settled.
 */
export async function fetchAccountPostings(
  masterlistId: string,
): Promise<DeskLedgerPosting[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("postings")
    .select(
      "id, amortization_schedule_id, amount, payments ( payment_date, reference_no, channel, status )",
    )
    .eq("masterlist_id", masterlistId)
    .order("posted_at", { ascending: true });

  return (data ?? []) as DeskLedgerPosting[];
}
