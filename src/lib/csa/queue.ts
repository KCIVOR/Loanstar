export type CsaWorkFilter =
  | "all"
  | "attention"
  | "documents"
  | "negotiation";

const ATTENTION_STATUSES = new Set(["on_hold", "for_revision"]);
const DOCUMENT_STATUSES = new Set([
  "registered",
  "documents_pending",
  "submitted",
  "for_revision",
]);
const NEGOTIATION_STATUSES = new Set([
  "negotiating_terms",
  "awaiting_confirmation",
]);

export function csaNeedsAttention(input: {
  status: string;
  blocker?: string | null;
}): boolean {
  return ATTENTION_STATUSES.has(input.status) || Boolean(input.blocker?.trim());
}

export function csaMatchesWorkFilter(
  input: { status: string; blocker?: string | null },
  filter: CsaWorkFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "attention") return csaNeedsAttention(input);
  if (filter === "documents") return DOCUMENT_STATUSES.has(input.status);
  if (filter === "negotiation") return NEGOTIATION_STATUSES.has(input.status);
  return true;
}

/** Whole days since the given timestamp (usually updated_at or created_at). */
export function daysInQueue(
  sinceIso: string,
  asOf = new Date(),
): number {
  const since = new Date(sinceIso);
  if (Number.isNaN(since.getTime())) return 0;
  const diffMs = asOf.getTime() - since.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export function formatBlockerLabel(
  blocker: string | null | undefined,
): string | null {
  if (!blocker?.trim()) return null;
  const plain = blocker.replaceAll("_", " ").trim();
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}
