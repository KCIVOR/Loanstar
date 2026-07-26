/** CSA open-agent-lead helpers (Phase 6). */

export function isOpenUnlinkedLead(lead: {
  applicationId: string | null;
  status: string;
}): boolean {
  return lead.applicationId == null && lead.status === "open";
}

/** Prefill CSA create form from agent lead borrower_name. */
export function parseBorrowerNameParts(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}
