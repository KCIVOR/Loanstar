export type ApprovalInput = {
  status: string;
  status_history: Array<{ status: string; at: string }> | null;
};

/** Current statuses that can only exist after Committee approved.
 *  Taken from APPLICATION_STATUSES that the origination funnel already
 *  treats as post-approval, plus live statuses observed 2026-08-19
 *  (`release_signing`). Denied/cancelled/draft/etc. are not in this set. */
const POST_APPROVAL_STATUSES = new Set([
  "approved",
  "negotiating_terms",
  "awaiting_confirmation",
  "lra_pending",
  "release_signing",
  "release_briefing",
  "release_ready",
  "released",
  "closed",
  "loan_active",
  "paid_off",
]);

function historyStatuses(app: ApprovalInput): string[] {
  return (app.status_history ?? []).map((e) => e.status);
}

export function isCommitteeApproved(app: ApprovalInput): boolean {
  if (app.status === "denied" || app.status === "cancelled") return false;
  if (POST_APPROVAL_STATUSES.has(app.status)) return true;
  return historyStatuses(app).includes("approved");
}

export function isCommitteeDenied(app: ApprovalInput): boolean {
  if (app.status === "denied") return true;
  const hist = historyStatuses(app);
  return hist.includes("denied") && !hist.includes("approved") && !POST_APPROVAL_STATUSES.has(app.status);
}

export function approvalRatePct(apps: ApprovalInput[]): number {
  const approved = apps.filter(isCommitteeApproved).length;
  const denied = apps.filter(isCommitteeDenied).length;
  const decided = approved + denied;
  return decided > 0 ? (approved / decided) * 100 : 0;
}
