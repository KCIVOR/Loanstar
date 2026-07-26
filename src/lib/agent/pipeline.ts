export type ChecklistFlagLike = {
  isRequired: boolean;
  completionStatus: string;
};

export type LeadPipelineStage =
  | "awaiting_link"
  | "gathering_docs"
  | "docs_ready";

export function checklistProgress(flags: ChecklistFlagLike[]): {
  required: number;
  complete: number;
  percent: number | null;
} {
  const requiredFlags = flags.filter((f) => f.isRequired);
  if (!requiredFlags.length) {
    return { required: 0, complete: 0, percent: null };
  }

  const complete = requiredFlags.filter((f) => {
    const s = f.completionStatus.toLowerCase();
    return s === "complete" || s === "uploaded" || s === "confirmed";
  }).length;

  return {
    required: requiredFlags.length,
    complete,
    percent: Math.round((complete / requiredFlags.length) * 100),
  };
}

export function leadPipelineStage(input: {
  applicationId: string | null;
  checklistPercent: number | null;
}): LeadPipelineStage {
  if (!input.applicationId) return "awaiting_link";
  if (input.checklistPercent === null || input.checklistPercent < 100) {
    return "gathering_docs";
  }
  return "docs_ready";
}

export function pipelineStageLabel(stage: LeadPipelineStage): string {
  switch (stage) {
    case "awaiting_link":
      return "Awaiting link";
    case "gathering_docs":
      return "Gathering docs";
    case "docs_ready":
      return "Docs ready";
  }
}

export function pipelineStageVariant(
  stage: LeadPipelineStage,
): "warning" | "navy" | "success" {
  if (stage === "awaiting_link") return "warning";
  if (stage === "docs_ready") return "success";
  return "navy";
}

export function leadStatusVariant(
  status: string,
): "teal" | "neutral" | "success" | "warning" {
  const s = status.toLowerCase();
  if (s === "open") return "teal";
  if (s === "converted" || s === "won") return "success";
  if (s === "closed" || s === "lost") return "neutral";
  return "warning";
}
