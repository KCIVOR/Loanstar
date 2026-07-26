import { cn } from "./cn";

/* Meridian §11 stepper — horizontal pipeline; vertical stacks the same
   anatomy per the reference's small-screen stepper. */
export type StepperStep = {
  label: string;
  description?: string;
  state: "done" | "current" | "todo";
};

const stateClass = { done: "done", current: "cur", todo: "" } as const;

export function Stepper({
  steps,
  orientation = "horizontal",
  className = "",
}: {
  steps: StepperStep[];
  orientation?: "horizontal" | "vertical";
  className?: string;
}) {
  return (
    <div className={cn("stepper", orientation === "vertical" && "!flex-col !gap-0", className)}>
      {steps.map((step, index) => (
        <div
          key={`${step.label}-${index}`}
          className={cn(
            "step",
            stateClass[step.state],
            orientation === "vertical" &&
              "!pt-0 !pb-6 !pl-10 !text-left last:!pb-0 [&::before]:!left-3 [&::before]:!top-[26px] [&::before]:!h-full [&::before]:!w-0.5 [&_.pt]:!left-0 [&_.pt]:!translate-x-0"
          )}
        >
          <span className="pt">{step.state === "done" ? "✓" : index + 1}</span>
          <div className="t">{step.label}</div>
          {step.description ? <div className="s">{step.description}</div> : null}
        </div>
      ))}
    </div>
  );
}
