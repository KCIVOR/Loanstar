"use client";

import { Stepper } from "@/components/ui";
import { borrowerPipelineSteps } from "@/lib/borrowers/pipeline";

/** Compact 7-stage borrower pipeline (not the full 19 staff statuses). */
export function BorrowerStatusTimeline({
  currentStatus,
  className,
}: {
  currentStatus: string;
  className?: string;
}) {
  const steps = borrowerPipelineSteps(currentStatus);

  return (
    <Stepper
      steps={steps}
      orientation="horizontal"
      className={className ?? "w-full max-w-none"}
    />
  );
}
