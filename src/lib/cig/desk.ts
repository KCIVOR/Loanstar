export type CigWorkFilter =
  | "all"
  | "revisions"
  | "callback_overdue"
  | "endorsed_today";

export function isSameCalendarDay(value: string, asOf = new Date()): boolean {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === asOf.getFullYear() &&
    d.getMonth() === asOf.getMonth() &&
    d.getDate() === asOf.getDate()
  );
}

export function daysSince(
  sinceIso: string | null | undefined,
  asOf = new Date(),
): number | null {
  if (!sinceIso) return null;
  const since = new Date(sinceIso);
  if (Number.isNaN(since.getTime())) return null;
  const diffMs = asOf.getTime() - since.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export function cigNeedsAttention(input: {
  isRevision: boolean;
  callbackOverdueAt: string | null;
}): boolean {
  return input.isRevision || Boolean(input.callbackOverdueAt);
}

export function cigMatchesWorkFilter(
  input: {
    isRevision: boolean;
    callbackOverdueAt: string | null;
    endorsedAt: string | null;
  },
  filter: CigWorkFilter,
  asOf = new Date(),
): boolean {
  if (filter === "all") return true;
  if (filter === "revisions") return input.isRevision;
  if (filter === "callback_overdue") return Boolean(input.callbackOverdueAt);
  if (filter === "endorsed_today") {
    return Boolean(input.endorsedAt && isSameCalendarDay(input.endorsedAt, asOf));
  }
  return true;
}

export function cigNextActionLabel(input: {
  isRevision: boolean;
  callbackOverdueAt: string | null;
}): string {
  if (input.callbackOverdueAt) return "Clear overdue callback";
  if (input.isRevision) return "Re-verify after committee";
  return "Verify file";
}
