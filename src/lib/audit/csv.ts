import { formatAuditDate } from "@/lib/audit/labels";
import type { ReadableAuditEvent } from "@/lib/audit/resolve";

const OUTCOME_WORDS: Record<string, string> = {
  approved: "Approved",
  rejected: "Rejected",
  returned: "Returned",
  cancelled: "Cancelled",
  completed: "Completed",
  changed: "Changed",
  created: "Created",
  deleted: "Deleted",
  viewed: "Viewed",
  signed_in: "Signed in",
  signed_out: "Signed out",
};

export function outcomeWord(outcome: string | null): string {
  return outcome ? (OUTCOME_WORDS[outcome] ?? outcome) : "";
}

function cell(value: string | null | undefined): string {
  const v = value ?? "";
  // Neutralise spreadsheet formulas, then quote every cell.
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function detailText(d: { label: string; before: string | null; after: string | null }): string {
  if (d.before && d.after && d.before !== d.after) return `${d.label}: ${d.before} → ${d.after}`;
  return `${d.label}: ${d.after ?? d.before}`;
}

/** Activity Log rows → CSV in the same plain language as the page. */
export function auditEventsToCsv(events: ReadableAuditEvent[]): string {
  const header = [
    "Date & time",
    "Person",
    "Role",
    "Area",
    "What happened",
    "Outcome",
    "Loan no.",
    "Borrower",
    "Details",
    "IP address",
  ];
  const lines = events.map((e) =>
    [
      formatAuditDate(e.createdAt),
      e.who.name,
      e.who.role ? `${e.who.role}${e.who.roleIsCurrent ? " (current role)" : ""}` : "",
      e.area,
      e.summary,
      outcomeWord(e.outcome),
      e.loan?.applicationNo ?? "",
      e.loan?.borrowerName ?? "",
      e.details.map(detailText).join("; "),
      e.technical.ipAddress ?? "",
    ]
      .map(cell)
      .join(","),
  );
  // BOM so Excel opens the ₱ and → characters correctly.
  return "﻿" + [header.map(cell).join(","), ...lines].join("\r\n");
}
