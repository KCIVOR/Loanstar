/** Intake document types staff-only (CSA). Hidden from borrower/agent portals. */
export const CSA_ONLY_INTAKE_SLUGS = [
  "clearance_form",
  "declaration_form",
  "agency_consent_letter",
  "data_privacy_consent",
  "bap_customer_consent",
] as const;

export type CsaOnlyIntakeSlug = (typeof CSA_ONLY_INTAKE_SLUGS)[number];

export function isCsaOnlyIntakeSlug(slug: string): boolean {
  return (CSA_ONLY_INTAKE_SLUGS as readonly string[]).includes(slug);
}

export function excludeCsaOnlyIntakeItems<T extends { documentTypeSlug: string }>(
  items: T[],
): T[] {
  return items.filter((item) => !isCsaOnlyIntakeSlug(item.documentTypeSlug));
}
