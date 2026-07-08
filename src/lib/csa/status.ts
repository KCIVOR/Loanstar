/** Statuses where CSA retains edit rights (pre-endorsement). */
export const CSA_EDITABLE_STATUSES = [
  "registered",
  "documents_pending",
  "submitted",
  "on_hold",
  "for_revision",
] as const;

export function isCsaEditableStatus(status: string): boolean {
  return (CSA_EDITABLE_STATUSES as readonly string[]).includes(status);
}
