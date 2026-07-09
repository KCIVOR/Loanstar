"use client";

import { Stepper, type StepperStep } from "@/components/ui";
import { APPLICATION_STATUSES } from "@/lib/constants";
import { formatStatusLabel } from "@/lib/applications/status";

export function StatusTimeline({ currentStatus }: { currentStatus: string }) {
  const currentIndex = APPLICATION_STATUSES.indexOf(
    currentStatus as (typeof APPLICATION_STATUSES)[number],
  );
  const isDenied = currentStatus === "denied";

  const steps: StepperStep[] = APPLICATION_STATUSES.map((status, index) => {
    const label = formatStatusLabel(status);
    if (currentIndex < 0) {
      return { label, state: "todo" as const };
    }
    if (index < currentIndex) {
      return { label, state: "done" as const };
    }
    if (status === currentStatus) {
      return {
        label,
        state: "current" as const,
        description: isDenied ? "Application denied" : undefined,
      };
    }
    return { label, state: "todo" as const };
  });

  return (
    <Stepper
      steps={steps}
      orientation="horizontal"
      className="w-full max-w-none"
    />
  );
}
