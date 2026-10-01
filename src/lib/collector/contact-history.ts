export type ContactHistoryRow = {
  id: string;
  contactType: string;
  notes: string | null;
  callbackAt: string | null;
  createdAt: string;
  collectorName: string;
};

export type RawContactRow = {
  id: string;
  contact_type: string;
  notes: string | null;
  callback_at: string | null;
  created_at: string;
  collector_user_id: string;
};

/** Maps collector_contacts rows to display rows, attaching the logger's name. */
export function toContactHistoryRows(
  rows: RawContactRow[],
  nameById: Map<string, string>,
): ContactHistoryRow[] {
  return rows.map((r) => ({
    id: r.id,
    contactType: r.contact_type,
    notes: r.notes,
    callbackAt: r.callback_at,
    createdAt: r.created_at,
    collectorName: nameById.get(r.collector_user_id) ?? "Unknown",
  }));
}
