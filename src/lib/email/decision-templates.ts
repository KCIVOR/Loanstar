export const COMMITTEE_DECISION_SLUGS = [
  "application_denied",
  "application_approved",
] as const;

export type CommitteeDecisionSlug = (typeof COMMITTEE_DECISION_SLUGS)[number];

export const ALLOWED_DECISION_VARS = ["borrower_name"] as const;

/** Merge keys that must never appear in decision emails (esp. denial). */
export const FORBIDDEN_DECISION_VARS = [
  "reason",
  "denial_reason",
  "comment",
  "committee_comment",
  "finding",
  "finding_notes",
  "notes",
] as const;

export function isCommitteeDecisionSlug(
  slug: string,
): slug is CommitteeDecisionSlug {
  return (COMMITTEE_DECISION_SLUGS as readonly string[]).includes(slug);
}

export function listForbiddenMergeVars(text: string): string[] {
  const found = new Set<string>();
  const re = /\{\{\s*(\w+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const key = m[1];
    if ((FORBIDDEN_DECISION_VARS as readonly string[]).includes(key)) {
      found.add(key);
    }
  }
  return [...found];
}

export function assertDecisionTemplateContent(input: {
  slug: string;
  subject: string;
  bodyHtml: string;
}): void {
  if (!isCommitteeDecisionSlug(input.slug)) {
    throw new Error(`Slug '${input.slug}' is not a committee decision template`);
  }
  const subject = input.subject.trim();
  const bodyHtml = input.bodyHtml.trim();
  if (!subject) throw new Error("Subject is required");
  if (!bodyHtml) throw new Error("Body HTML is required");

  const forbidden = [
    ...listForbiddenMergeVars(subject),
    ...listForbiddenMergeVars(bodyHtml),
  ];
  if (forbidden.length > 0) {
    throw new Error(
      `Forbidden merge variables in decision email: ${[...new Set(forbidden)].join(", ")}. Denial reasons must not be disclosed.`,
    );
  }

  // Optional: warn if unknown vars — strip or reject non-allowed
  const unknown: string[] = [];
  const re = /\{\{\s*(\w+)\s*\}\}/g;
  const blob = `${subject}\n${bodyHtml}`;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blob)) !== null) {
    if (!(ALLOWED_DECISION_VARS as readonly string[]).includes(m[1])) {
      if (!(FORBIDDEN_DECISION_VARS as readonly string[]).includes(m[1])) {
        unknown.push(m[1]);
      }
    }
  }
  if (unknown.length > 0) {
    throw new Error(
      `Unknown merge variables (allowed: borrower_name): ${[...new Set(unknown)].join(", ")}`,
    );
  }
}
