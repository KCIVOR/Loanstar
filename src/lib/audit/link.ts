/**
 * Adds `applicationId` to the after-snapshot so the Activity Log can show and
 * filter by loan. Never overwrites an id the caller already put there.
 */
export function mergeApplicationLink(
  afterData: Record<string, unknown> | null,
  applicationId: string | null,
): Record<string, unknown> | null {
  if (!applicationId) return afterData;
  if (afterData && afterData.applicationId) return afterData;
  return { ...(afterData ?? {}), applicationId };
}

/** Entity types whose `entity_id` is the loan application id itself. */
const LOAN_ID_ENTITIES = new Set([
  "loan_application",
  "application",
  "committee_vote",
  "verification",
]);

/**
 * Loan id stored on the row itself. Child-entity rows return null here and
 * are resolved through their table's `loan_application_id` at read time.
 * (The SQL index helper `public.audit_event_application_id` covers only the
 * loan_application/after_data cases; the viewer filters by entity ids instead.)
 */
export function directApplicationId(row: {
  entity_type: string | null;
  entity_id: string | null;
  after_data: Record<string, unknown> | null;
  before_data: Record<string, unknown> | null;
}): string | null {
  if (row.entity_id && row.entity_type && LOAN_ID_ENTITIES.has(row.entity_type)) {
    return row.entity_id;
  }
  const pick = (v: unknown) => (typeof v === "string" && v ? v : null);
  return (
    pick(row.after_data?.applicationId) ??
    pick(row.after_data?.loanApplicationId) ??
    pick(row.before_data?.applicationId)
  );
}

/** Table holding `loan_application_id` for an audited child entity type. */
const CHILD_TABLES: Record<string, string> = {
  release_file: "release_files",
  masterlist: "masterlist",
  computation: "computations",
  verification: "verifications",
  document: "documents",
  payment: "payments",
  committee_assessment: "committee_assessments",
  negotiation: "negotiations",
  negotiation_message: "negotiation_messages",
  callback: "callbacks",
  file_hold: "file_holds",
  rendered_document: "rendered_documents",
  application_cancellation: "application_cancellations",
  checks_recorded: "checks_recorded",
};

/** Every child table that carries `loan_application_id`. */
export const CHILD_TABLE_NAMES: readonly string[] = [...new Set(Object.values(CHILD_TABLES))];

export function childLookupTable(entityType: string | null): string | null {
  return entityType ? (CHILD_TABLES[entityType] ?? null) : null;
}
