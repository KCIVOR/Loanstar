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
  | { ids: string[]; unread?: true };

/** Validate mark-read body. */
export function parseMarkReadPatch(body: unknown): MarkReadPatch | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (o.all === true) return { all: true };
  if (Array.isArray(o.ids) && o.ids.every((id) => typeof id === "string")) {
    const ids = o.ids as string[];
    return o.unread === true ? { ids, unread: true } : { ids };
  }
  return null;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Short inbox timestamp: relative for the last week, then a calendar date. */
export function formatNotificationTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const diff = now.getTime() - then.getTime();
  if (diff < MINUTE_MS) return "Just now";
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)}m ago`;
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}h ago`;
  if (diff < 7 * DAY_MS) return `${Math.floor(diff / DAY_MS)}d ago`;
  return then.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: then.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}
