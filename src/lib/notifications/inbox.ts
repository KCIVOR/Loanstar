export type NotificationRow = {
  id: string;
  title: string;
  body: string;
  link: string | null;
  kind: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
};

export function mapNotificationRow(row: Record<string, unknown>): NotificationRow {
  return {
    id: row.id as string,
    title: row.title as string,
    body: row.body as string,
    link: (row.link as string | null) ?? null,
    kind: (row.kind as string | null) ?? null,
    entityType: (row.entity_type as string | null) ?? null,
    entityId: (row.entity_id as string | null) ?? null,
    readAt: (row.read_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export function countUnread(rows: NotificationRow[]): number {
  return rows.filter((r) => r.readAt == null).length;
}

export type MarkReadPatch =
  | { all: true }
  | { ids: string[] };

/** Validate mark-read body. */
export function parseMarkReadPatch(body: unknown): MarkReadPatch | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (o.all === true) return { all: true };
  if (Array.isArray(o.ids) && o.ids.every((id) => typeof id === "string")) {
    return { ids: o.ids as string[] };
  }
  return null;
}
