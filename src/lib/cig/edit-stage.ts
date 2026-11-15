import type { OpenRevisitNotice } from "@/lib/committee/revisit-notices";

/**
 * CIG may edit the verification form while the file is in verification, and
 * also while Committee has sent it back to CIG (`for_revision` with an open
 * revisit notice routed to CIG). A file returned to CSA, or one with no open
 * notice, stays locked for CIG.
 */
export function isCigEditableStage(
  status: string,
  openNotice: Pick<OpenRevisitNotice, "routeTo"> | null | undefined,
): boolean {
  if (status === "for_verification") return true;
  return status === "for_revision" && openNotice?.routeTo === "cig";
}
