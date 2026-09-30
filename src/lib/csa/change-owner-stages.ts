/**
 * Statuses in which a CSA may move an application from one borrower portal
 * account to another. Must match the list enforced in the
 * `reassign_application_borrower_account` RPC
 * (supabase/migrations/20260930223826_reassign_application_owner.sql) —
 * the RPC is the real boundary; this list only decides whether to show the UI.
 */
export const CHANGE_OWNER_ALLOWED_STATUSES = [
  "draft",
  "registered",
  "documents_pending",
  "submitted",
  "on_hold",
  "for_revision",
  "for_verification",
] as const;

export function canChangeOwner(status: string): boolean {
  return (CHANGE_OWNER_ALLOWED_STATUSES as readonly string[]).includes(status);
}
