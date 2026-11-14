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
