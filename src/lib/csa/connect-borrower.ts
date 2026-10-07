import type { SupabaseClient } from "@supabase/supabase-js";

import { ValidationError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";

/** Imported accounts stay in AR until the borrower portal supports their history. */
export async function assertApplicationCanConnectBorrowerAccount(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("masterlist")
    .select("is_legacy_import")
    .eq("loan_application_id", applicationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data?.is_legacy_import === true) {
    throw new ValidationError(
      "Imported loans are AR-only and cannot be connected to a borrower account yet.",
    );
  }
}

export type BorrowerAccountResult = {
  id: string;
  borrowerNo: string | null;
  fullName: string;
  email: string;
  mobilePhone: string | null;
};

/** Only borrowers with a linked portal account (`user_id` set) are valid
 * connect targets — searching the full borrowers table would surface other
 * walk-in records, which is exactly what this feature is meant to resolve. */
export async function searchBorrowerAccounts(
  supabase: SupabaseClient,
  term: string,
): Promise<BorrowerAccountResult[]> {
  const trimmed = term.trim();
  if (!trimmed) return [];

  const pattern = `"%${trimmed}%"`;
  const { data, error } = await supabase
    .from("borrowers")
    .select("id, borrower_no, first_name, middle_name, last_name, email, mobile_phone")
    .not("user_id", "is", null)
    .or(
      `first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern},borrower_no.ilike.${pattern}`,
    )
    .order("last_name")
    .limit(20);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    borrowerNo: (row.borrower_no as string) ?? null,
    fullName: [row.first_name, row.middle_name, row.last_name]
      .filter(Boolean)
      .join(" "),
    email: row.email as string,
    mobilePhone: (row.mobile_phone as string) ?? null,
  }));
}

/**
 * Re-points a walk-in application at an existing, portal-linked borrower
 * account. Deliberately does not merge/copy profile fields between the two
 * `borrowers` rows, and does not delete or edit the old walk-in row.
 *
 * All validation and writes (loan_applications, masterlist, documents,
 * payments, status history) run inside one security-definer RPC so they
 * commit or roll back together. Called with a service-role client:
 * `loan_applications`' generic RLS update policy requires
 * `is_csa_editable_status(status)`, so a walk-in application already past
 * intake would silently fail under the session client. The RPC is granted
 * to `service_role` only.
 */
export async function connectApplicationToBorrowerAccount(
  applicationId: string,
  targetBorrowerId: string,
  actorId: string,
): Promise<{ borrowerId: string; borrowerUserId: string }> {
  const admin = createServiceClient();
  await assertApplicationCanConnectBorrowerAccount(admin, applicationId);
  const { data, error } = await admin.rpc(
    "connect_application_to_borrower_account",
    {
      p_application_id: applicationId,
      p_target_borrower_id: targetBorrowerId,
      p_actor_id: actorId,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.borrower_id || !row?.borrower_user_id) {
    throw new Error("Failed to connect borrower account");
  }

  return {
    borrowerId: row.borrower_id as string,
    borrowerUserId: row.borrower_user_id as string,
  };
}

/**
 * Moves an application that already belongs to one portal-linked borrower to
 * another portal-linked borrower ("Change owner"). Same atomic-RPC approach
 * as `connectApplicationToBorrowerAccount`; the RPC also enforces the allowed
 * stages and the required reason.
 */
export async function reassignApplicationBorrowerAccount(
  applicationId: string,
  targetBorrowerId: string,
  actorId: string,
  reason: string,
): Promise<{
  borrowerId: string;
  borrowerUserId: string;
  previousBorrowerId: string;
  previousUserId: string;
}> {
  const admin = createServiceClient();
  await assertApplicationCanConnectBorrowerAccount(admin, applicationId);
  const { data, error } = await admin.rpc(
    "reassign_application_borrower_account",
    {
      p_application_id: applicationId,
      p_target_borrower_id: targetBorrowerId,
      p_actor_id: actorId,
      p_reason: reason,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (
    !row?.borrower_id ||
    !row?.borrower_user_id ||
    !row?.previous_borrower_id ||
    !row?.previous_user_id
  ) {
    throw new Error("Failed to change application owner");
  }

  return {
    borrowerId: row.borrower_id as string,
    borrowerUserId: row.borrower_user_id as string,
    previousBorrowerId: row.previous_borrower_id as string,
    previousUserId: row.previous_user_id as string,
  };
}
