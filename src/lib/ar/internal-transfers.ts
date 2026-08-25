import type { SupabaseClient } from "@supabase/supabase-js";

export type InternalTransferListItem = {
  id: string;
  sourceLoanApplicationId: string;
  sourceApplicationNo: string | null;
  sourceLoanAccountNo: string | null;
  targetMasterlistId: string;
  targetLoanAccountNo: string | null;
  targetOutstandingBalance: number;
  transferType: "other_loan" | "offset";
  months: number | null;
  amount: number;
  createdAt: string;
};

/** Lists every transfer awaiting AR review, newest first. */
export async function listPendingInternalTransfers(
  supabase: SupabaseClient,
): Promise<InternalTransferListItem[]> {
  const { data, error } = await supabase
    .from("internal_transfers")
    .select(
      `
      id, source_loan_application_id, target_masterlist_id, transfer_type,
      months, amount, created_at,
      source_application:loan_applications!internal_transfers_source_loan_application_id_fkey ( application_no ),
      source_masterlist:masterlist!internal_transfers_source_masterlist_id_fkey ( loan_account_no ),
      target_masterlist:masterlist!internal_transfers_target_masterlist_id_fkey ( loan_account_no, outstanding_balance )
    `,
    )
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const sourceApp = Array.isArray(row.source_application)
      ? row.source_application[0]
      : row.source_application;
    const sourceMl = Array.isArray(row.source_masterlist)
      ? row.source_masterlist[0]
      : row.source_masterlist;
    const targetMl = Array.isArray(row.target_masterlist)
      ? row.target_masterlist[0]
      : row.target_masterlist;

    return {
      id: row.id as string,
      sourceLoanApplicationId: row.source_loan_application_id as string,
      sourceApplicationNo: (sourceApp?.application_no as string | null) ?? null,
      sourceLoanAccountNo: (sourceMl?.loan_account_no as string | null) ?? null,
      targetMasterlistId: row.target_masterlist_id as string,
      targetLoanAccountNo: (targetMl?.loan_account_no as string | null) ?? null,
      targetOutstandingBalance: Number(targetMl?.outstanding_balance ?? 0),
      transferType: row.transfer_type as "other_loan" | "offset",
      months: row.months as number | null,
      amount: Number(row.amount),
      createdAt: row.created_at as string,
    };
  });
}

/**
 * AR confirms a pending transfer. The whole confirm sequence (lock rows,
 * allocate against open installments oldest-first, update the account
 * summary balance, flip status) runs atomically inside the
 * `post_internal_transfer` Postgres function — see
 * `docs/superpowers/plans/2026-08-21-internal-transfer-atomicity-fix.md`
 * for why: a JS-side multi-step sequence had no protection against a
 * failed-then-retried confirm double-allocating, or two concurrent confirms
 * racing on the same balance read.
 */
export async function postInternalTransfer(
  supabase: SupabaseClient,
  transferId: string,
  actorId: string,
): Promise<{ newBalance: number; postedAt: string }> {
  const { data, error } = await supabase.rpc("post_internal_transfer", {
    p_transfer_id: transferId,
    p_actor_id: actorId,
  });

  if (error) throw new Error(error.message);

  return {
    newBalance: Number((data as { newBalance: number }).newBalance),
    postedAt: (data as { postedAt: string }).postedAt,
  };
}

/** AR rejects a pending transfer — no balance change, just records why. */
export async function rejectInternalTransfer(
  supabase: SupabaseClient,
  transferId: string,
  actorId: string,
  reason: string,
): Promise<{ rejectedAt: string }> {
  const { data, error } = await supabase.rpc("reject_internal_transfer", {
    p_transfer_id: transferId,
    p_actor_id: actorId,
    p_reason: reason,
  });

  if (error) throw new Error(error.message);

  return { rejectedAt: (data as { rejectedAt: string }).rejectedAt };
}
