import type { StepperStep } from "@/components/ui";
import { formatStatusLabel } from "@/lib/applications/status";

/* Meridian §11 pipeline stepper — shared across every staff portal's
   application detail page so the 5-stage view stays consistent. */
export const PIPELINE_STAGES = [
  {
    label: "Application",
    statuses: ["registered", "documents_pending", "submitted", "on_hold", "for_revision"],
  },
  { label: "Verification", statuses: ["for_verification"] },
  { label: "Committee", statuses: ["for_approval", "committee_hold"] },
  {
    label: "Approval",
    statuses: ["approved", "denied", "negotiating_terms", "awaiting_confirmation"],
  },
  {
    label: "Release",
    statuses: [
      "lra_pending",
      "release_signing",
      "release_briefing",
      "release_ready",
      "released",
      "closed",
      "loan_active",
      "paid_off",
    ],
  },
] as const;

export function buildPipelineSteps(status: string): StepperStep[] {
  const stageIndex = PIPELINE_STAGES.findIndex((stage) =>
    (stage.statuses as readonly string[]).includes(status),
  );
  const currentIndex = stageIndex === -1 ? 0 : stageIndex;
  return PIPELINE_STAGES.map((stage, index) => ({
    label: stage.label,
    description: index === currentIndex ? formatStatusLabel(status) : undefined,
    state: index < currentIndex ? "done" : index === currentIndex ? "current" : "todo",
  }));
}
