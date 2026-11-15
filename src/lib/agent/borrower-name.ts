import { formatBorrowerName } from "@/lib/borrower-name";

/** Agent-module display formatter -- delegates to the shared Last, First Middle format. */
export function formatBorrowerDisplayName(parts: {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  suffix?: string | null;
}): string {
  const lastWithSuffix = [parts.lastName, parts.suffix]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .join(" ");
  return formatBorrowerName({
    firstName: parts.firstName,
    middleName: parts.middleName,
    lastName: lastWithSuffix,
  });
}
