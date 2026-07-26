import { formatStatusLabel } from "../applications/status";
import {
  getCompletionSummary,
  type ChecklistItem,
} from "../documents/checklist";
import { formatBlockerLabel } from "./queue";

export type CsaWorkspaceStageId =
  | "documents"
  | "ncl"
  | "computation"
  | "endorse";

export type CsaWorkspaceStep = {
  label: string;
  state: "done" | "current" | "todo";
  description?: string;
};

export const CSA_WORKSPACE_STAGES: Array<{
  id: CsaWorkspaceStageId;
  label: string;
}> = [
  { id: "documents", label: "Documents" },
  { id: "ncl", label: "NCL screen" },
  { id: "computation", label: "Computation" },
  { id: "endorse", label: "Endorse" },
];

export type CsaNextStep = {
  title: string;
  body: string;
};

export function csaDocsSummary(checklist: ChecklistItem[] | null | undefined) {
  if (!checklist?.length) {
    return { required: 0, uploaded: 0, complete: 0, percent: 0 };
  }
  const summary = getCompletionSummary(checklist);
  return {
    required: summary.required,
    uploaded: summary.uploaded,
    complete: summary.complete,
    percent:
      summary.required === 0
        ? 100
        : Math.round((summary.uploaded / summary.required) * 100),
  };
}

/**
 * CSA intake workspace focus — not the full loan lifecycle.
 * Negotiation happens after endorse; it is not a primary CSA stage here.
 */
export function csaWorkspaceStageIndex(input: {
  status: string;
  docsComplete: boolean;
  nclDone: boolean;
  hasComputation: boolean;
  endorseReady: boolean;
}): number {
  const { status } = input;

  if (
    ["for_verification", "for_approval", "approved", "denied"].includes(
      status,
    ) ||
    ["negotiating_terms", "awaiting_confirmation"].includes(status) ||
    status.startsWith("release") ||
    ["lra_pending", "released", "closed", "loan_active", "paid_off"].includes(
      status,
    )
  ) {
    return 3; // past endorse / left CSA intake
  }

  if (input.endorseReady || status === "submitted") {
    return 3;
  }
  if (input.hasComputation) {
    return 2;
  }
  if (input.nclDone && input.docsComplete) {
    return 2;
  }
  if (input.nclDone) {
    return 1;
  }
  if (input.docsComplete) {
    return 1;
  }
  return 0;
}

export function buildCsaWorkspaceSteps(input: {
  status: string;
  docsComplete: boolean;
  nclDone: boolean;
  hasComputation: boolean;
  endorseReady: boolean;
}): CsaWorkspaceStep[] {
  const current = csaWorkspaceStageIndex(input);
  return CSA_WORKSPACE_STAGES.map((stage, index) => ({
    label: stage.label,
    description:
      index === current ? formatStatusLabel(input.status) : undefined,
    state:
      index < current ? "done" : index === current ? "current" : "todo",
  }));
}

export function csaNextStep(input: {
  status: string;
  blocker?: string | null;
  docsRequired: number;
  docsUploaded: number;
  nclResult: string;
  hasComputation: boolean;
  endorseReady: boolean;
}): CsaNextStep {
  const blocker = formatBlockerLabel(input.blocker);
  const missingDocs = Math.max(input.docsRequired - input.docsUploaded, 0);

  if (input.status === "on_hold") {
    return {
      title: "File on hold",
      body: blocker
        ? `${blocker}. Clear the hold reason before endorsing.`
        : "Resolve the hold reason, then continue intake.",
    };
  }
  if (input.status === "for_revision") {
    return {
      title: "Revision required",
      body: blocker
        ? `${blocker}. Update documents and re-check the file.`
        : "Borrower documents need updates before you can endorse.",
    };
  }
  if (
    ["negotiating_terms", "awaiting_confirmation"].includes(input.status)
  ) {
    return {
      title: "Terms in progress",
      body: "Computation was disclosed. Manage negotiation / confirmation below.",
    };
  }
  if (
    ["for_verification", "for_approval", "approved", "denied"].includes(
      input.status,
    )
  ) {
    return {
      title: "Past CSA intake",
      body: `Status is ${formatStatusLabel(input.status)}. Intake actions are locked.`,
    };
  }

  if (missingDocs > 0 || input.docsRequired === 0 && !input.hasComputation) {
    if (missingDocs > 0) {
      return {
        title: "Complete intake documents",
        body: `${missingDocs} required document${missingDocs === 1 ? "" : "s"} still missing (${input.docsUploaded}/${input.docsRequired} uploaded).`,
      };
    }
  }

  if (input.nclResult === "pending") {
    return {
      title: "Record NCL screening",
      body: "Run the negative credit list check before endorsement to CIG.",
    };
  }
  if (input.nclResult === "fail") {
    return {
      title: "NCL flagged",
      body: "Borrower matched the negative credit list. Review remarks before deciding next steps.",
    };
  }
  if (!input.hasComputation) {
    return {
      title: "Run loan computation",
      body: "Select a loan type and generate the computation package.",
    };
  }
  if (!input.endorseReady) {
    return {
      title: "Finish endorse requirements",
      body: "Review the missing items in Endorse to CIG, then endorse when ready.",
    };
  }
  return {
    title: "Ready to endorse",
    body: "All intake requirements are met. Endorse this file to CIG verification.",
  };
}
