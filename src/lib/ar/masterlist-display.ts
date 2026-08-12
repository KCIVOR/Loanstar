/**
 * Pure display helpers for masterlist identity columns (AR / collector / remedial).
 *
 * These live apart from `@/lib/ar/masterlist` deliberately: every caller is a
 * Client Component, and `masterlist.ts` transitively imports `@/lib/supabase/server`
 * (via `@/lib/csa/computation`), which pulls in `next/headers` and breaks the
 * production build when reached from a client bundle.
 *
 * Keep this module free of any server-only import. Same pattern as
 * `@/lib/ar/penalty-rate`.
 */

/** Column labels for AR/collector/remedial identity display. */
export function masterlistEmploymentLabels(
  segment: string | null | undefined,
): { employer: string; secondary: string } {
  if (segment === "sme") {
    return { employer: "Company", secondary: "Nature of business" };
  }
  return { employer: "Manning agency", secondary: "Vessel" };
}

/** One-line identity under borrower name (company · nature, or agency · vessel). */
export function masterlistSecondaryIdentity(row: {
  manning_agency?: string | null;
  vessel_name?: string | null;
}): string | null {
  const parts = [row.manning_agency, row.vessel_name]
    .map((v) => (v ?? "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
