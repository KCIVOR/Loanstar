export function formatBorrowerName(parts: {
  firstName: string;
  lastName: string;
  middleName?: string | null;
}): string {
  const given = [parts.firstName, parts.middleName]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .join(" ");
  const last = parts.lastName?.trim();
  if (!last) return given || "Unknown borrower";
  return given ? `${last}, ${given}` : last;
}

/**
 * For consumers of a stored name string (e.g. masterlist.borrower_name)
 * that also carry a link to the live borrower record: prefer the live
 * record (so middle name and edits show up), falling back to the stored
 * string for orphaned rows with no live link.
 */
export function resolveBorrowerName(
  linked: { firstName: string; lastName: string; middleName?: string | null } | null | undefined,
  storedFallback: string | null | undefined,
): string {
  if (linked) return formatBorrowerName(linked);
  return storedFallback?.trim() || "Unknown borrower";
}
