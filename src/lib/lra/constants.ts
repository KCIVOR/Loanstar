/** Element type for `release_files.release_paths` / `masterlist.release_paths` (`ReleasePath[]`). */
export type ReleasePath = "with_pdc" | "without_pdc";

export type ReleaseFileStatus =
  | "awaiting_path"
  | "pdc_encoding"
  | "ready_generate"
  | "awaiting_signatures"
  | "awaiting_briefing"
  | "ready_release"
  | "released"
  | "closed";

// Which release documents are generated for a loan is no longer hardcoded here.
// It is an admin setting per template (`document_templates.seafarer_generation`
// / `sme_generation`), resolved by `src/lib/lra/release-documents.ts`. The
// path -> voucher-pair and collateral -> mortgage conditions live there too
// (`PATH_SPECIFIC_SLUGS`, `templateConditionMatches`).

export const BLOCKER_BY_STATUS: Record<ReleaseFileStatus, string> = {
  awaiting_path: "Pending: release path selection",
  pdc_encoding: "Pending: PDC not yet submitted",
  ready_generate: "Pending: document generation",
  awaiting_signatures: "Pending: document signatures",
  awaiting_briefing: "Documents signed, awaiting briefing",
  ready_release: "Documents signed, awaiting check release",
  released: "Released",
  closed: "Released — transmitted to main branch",
};

export function releaseStageForPath(path: ReleasePath): string {
  return path === "with_pdc" ? "signing_with_pdc" : "signing_without_pdc";
}

/** All signing checklist stages for the selected release path(s). */
export function releaseStagesForPaths(paths: ReleasePath[]): string[] {
  return paths.map(releaseStageForPath);
}

export function readyReleaseBlocker(paths: ReleasePath[] | null): string {
  if (paths == null) {
    return BLOCKER_BY_STATUS.ready_release;
  }
  const hasWithPdc = paths.includes("with_pdc");
  const hasWithoutPdc = paths.includes("without_pdc");
  if (hasWithPdc && hasWithoutPdc) {
    return "Documents signed, awaiting check and cash release";
  }
  if (hasWithoutPdc) {
    return "Documents signed, awaiting cash release";
  }
  return BLOCKER_BY_STATUS.ready_release;
}

/** Release is allowed only when briefing was click-signed by the borrower. */
export function canRecordRelease(
  releaseStatus: ReleaseFileStatus,
  briefingAcknowledgedAt: string | null | undefined,
): boolean {
  return releaseStatus === "ready_release" && Boolean(briefingAcknowledgedAt);
}
