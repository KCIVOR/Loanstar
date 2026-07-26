export type BorrowerPipelineStageId =
  | "documents"
  | "review"
  | "approval"
  | "terms"
  | "release"
  | "active_loan"
  | "paid_off";

export type BorrowerPipelineStage = {
  id: BorrowerPipelineStageId;
  label: string;
};

export type BorrowerPipelineStepState = "done" | "current" | "todo";

export type BorrowerPipelineStep = {
  label: string;
  state: BorrowerPipelineStepState;
  description?: string;
};

/** Borrower-facing happy path — side statuses map into these buckets. */
export const BORROWER_PIPELINE_STAGES: readonly BorrowerPipelineStage[] = [
  { id: "documents", label: "Documents" },
  { id: "review", label: "Review" },
  { id: "approval", label: "Approval" },
  { id: "terms", label: "Terms" },
  { id: "release", label: "Release" },
  { id: "active_loan", label: "Active loan" },
  { id: "paid_off", label: "Paid off" },
] as const;

const STATUS_TO_STAGE: Record<string, BorrowerPipelineStageId> = {
  draft: "documents",
  registered: "documents",
  documents_pending: "documents",
  for_revision: "documents",
  submitted: "review",
  for_verification: "review",
  on_hold: "review",
  for_approval: "approval",
  committee_hold: "approval",
  approved: "approval",
  denied: "approval",
  negotiating_terms: "terms",
  awaiting_confirmation: "terms",
  lra_pending: "release",
  release_signing: "release",
  release_briefing: "release",
  release_ready: "release",
  released: "active_loan",
  closed: "active_loan",
  loan_active: "active_loan",
  paid_off: "paid_off",
};

export function borrowerPipelineIndex(status: string): number {
  const stageId = STATUS_TO_STAGE[status];
  if (!stageId) return -1;
  return BORROWER_PIPELINE_STAGES.findIndex((s) => s.id === stageId);
}

function stageNote(status: string): string | undefined {
  switch (status) {
    case "draft":
      return "Draft — submit when ready";
    case "denied":
      return "Application denied";
    case "on_hold":
      return "On hold";
    case "committee_hold":
      return "On hold — committee";
    case "for_revision":
      return "Documents need updates";
    case "release_signing":
      return "Sign release documents";
    case "release_briefing":
      return "Complete briefing";
    default:
      return undefined;
  }
}

/**
 * Compact stepper model for borrower portal pages.
 * Denied / on-hold / revision stay on their bucket — they are not extra steps.
 */
export function borrowerPipelineSteps(status: string): BorrowerPipelineStep[] {
  const currentIndex = borrowerPipelineIndex(status);
  const note = stageNote(status);

  return BORROWER_PIPELINE_STAGES.map((stage, index) => {
    if (currentIndex < 0) {
      return { label: stage.label, state: "todo" as const };
    }
    if (index < currentIndex) {
      return { label: stage.label, state: "done" as const };
    }
    if (index === currentIndex) {
      return {
        label: stage.label,
        state: "current" as const,
        description: note,
      };
    }
    return { label: stage.label, state: "todo" as const };
  });
}
