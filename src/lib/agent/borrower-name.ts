export function formatBorrowerDisplayName(parts: {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  suffix?: string | null;
}): string {
  return [parts.firstName, parts.middleName, parts.lastName, parts.suffix]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .join(" ");
}
