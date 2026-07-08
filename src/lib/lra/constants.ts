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

export const AUTO_GENERATED_SLUGS: Record<ReleasePath, string[]> = {
  with_pdc: [
    "blri",
    "promissory_note",
    "disclosure_statement",
    "check_voucher",
    "ar_check_voucher",
  ],
  without_pdc: [
    "blri",
    "promissory_note",
    "disclosure_statement",
    "cash_voucher",
    "ar_cash_voucher",
  ],
};

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

export function readyReleaseBlocker(path: ReleasePath | null): string {
  return path === "without_pdc"
    ? "Documents signed, awaiting cash release"
    : BLOCKER_BY_STATUS.ready_release;
}

/** Release is allowed only when briefing was click-signed by the borrower. */
export function canRecordRelease(
  releaseStatus: ReleaseFileStatus,
  briefingAcknowledgedAt: string | null | undefined,
): boolean {
  return releaseStatus === "ready_release" && Boolean(briefingAcknowledgedAt);
}
