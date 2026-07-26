import { formatStatusLabel } from "../applications/status";
import { daysSince } from "./desk";
import {
  cigSequenceStageLabel,
  type CigSequenceStage,
  type CigSequenceState,
} from "./sequence";

export type CigWorkspaceStageId = CigSequenceStage;

export type CigWorkspaceStep = {
  label: string;
  state: "done" | "current" | "todo";
  description?: string;
};

export const CIG_WORKSPACE_STAGES: Array<{
  id: CigWorkspaceStageId;
  label: string;
}> = [
  { id: "borrower_review", label: "Borrower" },
  { id: "external_checks", label: "Checks" },
  { id: "ci_references", label: "CI & Refs" },
  { id: "crewing_manager", label: "Crewing" },
  { id: "finding", label: "Finding" },
  { id: "forward", label: "Forward" },
];

const STAGE_INDEX: Record<CigSequenceStage, number> = {
  borrower_review: 0,
  external_checks: 1,
  ci_references: 2,
  crewing_manager: 3,
  finding: 4,
  forward: 5,
};

export type CigNextStep = {
  title: string;
  body: string;
};

export function cigChecksSummary(
  checks: Array<{ result: string }> | null | undefined,
) {
  const list = checks ?? [];
  const total = list.length;
  const recorded = list.filter(
    (c) => c.result === "pass" || c.result === "fail",
  ).length;
  const passed = list.filter((c) => c.result === "pass").length;
  return {
    total,
    recorded,
    passed,
    complete: total > 0 ? recorded >= total : false,
    percent: total === 0 ? 100 : Math.round((recorded / total) * 100),
  };
}

function isCheckMissing(item: string): boolean {
  return item.endsWith(" check not recorded");
}

function isFindingMissing(item: string): boolean {
  return /finding/i.test(item);
}

/** Form sections excluding external checks and the final finding. */
export function cigFormComplete(
  missing: string[] | null | undefined,
): boolean {
  const list = missing ?? [];
  return (
    list.filter(
      (item) => !isCheckMissing(item) && !isFindingMissing(item),
    ).length === 0
  );
}

export function cigHasFinding(
  finding: "positive" | "negative" | null | undefined,
): boolean {
  return finding === "positive" || finding === "negative";
}

function isTerminalVerificationStatus(status: string, forwarded: boolean) {
  return (
    forwarded ||
    ["for_approval", "approved", "denied"].includes(status) ||
    ["negotiating_terms", "awaiting_confirmation"].includes(status) ||
    status.startsWith("release") ||
    ["lra_pending", "released", "closed", "loan_active", "paid_off"].includes(
      status,
    )
  );
}

/**
 * Index into CIG_WORKSPACE_STAGES from hard-sequence current stage.
 */
export function cigWorkspaceStageIndex(input: {
  status: string;
  sequenceCurrent: CigSequenceStage;
  forwarded: boolean;
}): number {
  if (isTerminalVerificationStatus(input.status, input.forwarded)) {
    return STAGE_INDEX.forward;
  }
  return STAGE_INDEX[input.sequenceCurrent];
}

export function buildCigWorkspaceSteps(input: {
  status: string;
  sequenceCurrent: CigSequenceStage;
  forwarded: boolean;
}): CigWorkspaceStep[] {
  const current = cigWorkspaceStageIndex(input);
  return CIG_WORKSPACE_STAGES.map((stage, index) => ({
    label: stage.label,
    description:
      index === current ? formatStatusLabel(input.status) : undefined,
    state:
      index < current ? "done" : index === current ? "current" : "todo",
  }));
}

export function cigForwardReady(input: {
  checksComplete: boolean;
  formComplete: boolean;
  hasFinding: boolean;
  forwarded: boolean;
}): boolean {
  if (input.forwarded) return true;
  return input.checksComplete && input.formComplete && input.hasFinding;
}

export function cigForwardReadyFromSequence(
  sequence: CigSequenceState,
  forwarded: boolean,
): boolean {
  if (forwarded) return true;
  return sequence.unlocked.forward;
}

export function cigNextStep(input: {
  status: string;
  missing: string[];
  sequence: CigSequenceState;
  forwarded: boolean;
  activeCallbackAt: string | null;
  callbackOverdue?: boolean;
}): CigNextStep {
  if (input.status === "for_revision") {
    return {
      title: "Committee revisit",
      body: "Complete the requested verification updates, then mark revision complete to return the file to Committee.",
    };
  }

  if (
    input.forwarded ||
    ["for_approval", "approved", "denied"].includes(input.status)
  ) {
    return {
      title: "With Committee",
      body: "Verification is complete. This file is with Committee for decision.",
    };
  }

  if (input.activeCallbackAt) {
    const when = new Date(input.activeCallbackAt).toLocaleString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    if (input.callbackOverdue) {
      return {
        title: "Callback overdue",
        body: `Follow up was due ${when}. Clear the callback and finish verification.`,
      };
    }
    return {
      title: "Callback scheduled",
      body: `File is held until ${when}. Resume verification when the callback is due.`,
    };
  }

  const { current } = input.sequence;

  if (current === "borrower_review") {
    const first = input.missing.find(
      (item) =>
        /field completeness|borrower interview/i.test(item) ||
        item === "Verification form not started",
    );
    return {
      title: "Complete borrower review",
      body: first
        ? `${first}. Then external checks unlock.`
        : "Confirm field completeness and finish the borrower interview.",
    };
  }

  if (current === "external_checks") {
    return {
      title: "Record external checks",
      body: "Pass or fail each third-party check. CI & References unlocks when all checks are recorded.",
    };
  }

  if (current === "ci_references") {
    const first = input.missing.find(
      (item) =>
        /PIC |Reference |CI & References|rating/i.test(item) &&
        !item.endsWith(" check not recorded"),
    );
    return {
      title: "Complete CI & References Form",
      body: first
        ? `${first}. Crewing manager unlocks when this stage is complete.`
        : "Open the CI & References Form and finish the required PIC, references, checklist, and rating.",
    };
  }

  if (current === "crewing_manager") {
    const first = input.missing.find((item) => /Crewing manager/i.test(item));
    return {
      title: "Complete crewing manager",
      body: first
        ? `${first}. Finding unlocks next.`
        : "Record crewing manager position, contract, departure, and fit-to-work.",
    };
  }

  if (current === "finding") {
    return {
      title: "Set finding",
      body: "Record a positive or negative finding to complete the CI report.",
    };
  }

  return {
    title: "Ready to submit",
    body: "All verification requirements are met. Submit the CI report to Committee.",
  };
}

export function cigSequenceLockedHint(stage: CigSequenceStage): string {
  const labels: Record<CigSequenceStage, string> = {
    borrower_review: cigSequenceStageLabel("borrower_review"),
    external_checks: cigSequenceStageLabel("external_checks"),
    ci_references: cigSequenceStageLabel("ci_references"),
    crewing_manager: cigSequenceStageLabel("crewing_manager"),
    finding: cigSequenceStageLabel("finding"),
    forward: cigSequenceStageLabel("forward"),
  };
  const order: CigSequenceStage[] = [
    "borrower_review",
    "external_checks",
    "ci_references",
    "crewing_manager",
    "finding",
    "forward",
  ];
  const idx = order.indexOf(stage);
  const prereq = idx > 0 ? labels[order[idx - 1]] : labels.borrower_review;
  return `Locked until ${prereq} is complete.`;
}

export function cigWaitingLabel(
  endorsedAt: string | null | undefined,
  asOf = new Date(),
): string {
  const days = daysSince(endorsedAt, asOf);
  if (days == null) return "—";
  if (days === 0) return "today";
  return `${days}d`;
}
