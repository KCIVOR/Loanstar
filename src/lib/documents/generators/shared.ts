import type { Address } from "@/lib/borrowers/types";
import { formatMoney } from "@/lib/documents/format";
import { pesosInWords } from "@/lib/lra/template-context";

export const COMPANY_NAME = "Loan Star Lending Group Corp.";

/** Re-exported so generators share one money/words source of truth. */
export { formatMoney, pesosInWords };

/** Join a borrower present address into one line, matching the release docs. */
export function joinAddress(a: Address | null | undefined): string {
  if (!a) return "";
  return [a.street, a.barangay, a.city, a.province, a.zipCode]
    .filter(Boolean)
    .join(", ");
}

/** Format a Date (or ISO string) as MM/DD/YYYY for document display. */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

/** Whole days from `from` up to `to` (0 if not yet past). */
export function daysBetween(
  from: Date | string,
  to: Date | string = new Date(),
): number {
  const a = from instanceof Date ? from : new Date(from);
  const b = to instanceof Date ? to : new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  const ms = b.getTime() - a.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** `to` shifted by `days`. */
export function addDays(date: Date | string, days: number): Date {
  const d = date instanceof Date ? new Date(date) : new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
