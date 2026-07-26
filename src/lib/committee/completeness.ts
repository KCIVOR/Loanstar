import type { SupabaseClient } from "@supabase/supabase-js";

import { getReceiptReadiness, type ReceiptCheckItem } from "@/lib/cig/receipt";

/**
 * Committee's own "is this file complete?" review before deliberation —
 * reuses CIG's receipt check (attachments, borrower profile, signed
 * computation) and adds a check that CIG's own verification is finished.
 */
export async function getCommitteeCompleteness(
  supabase: SupabaseClient,
  applicationId: string,
  borrower: {
    firstName?: string | null;
    lastName?: string | null;
    mobilePhone?: string | null;
  } | null,
  verification: { isComplete: boolean; forwardedAt: string | null } | null,
): Promise<{ ready: boolean; items: ReceiptCheckItem[] }> {
  const base = await getReceiptReadiness(supabase, applicationId, borrower);

  const items: ReceiptCheckItem[] = [
    ...base.items,
    {
      label: "CIG verification complete",
      ok: Boolean(verification?.isComplete && verification?.forwardedAt),
    },
  ];

  return { ready: items.every((item) => item.ok), items };
}
