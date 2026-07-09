import { cn } from "./cn";

export type StepperStep = {
  label: string;
  description?: string;
  state: "done" | "current" | "todo";
};

export function Stepper({
  steps,
  orientation = "horizontal",
  className = "",
}: {
  steps: StepperStep[];
  orientation?: "horizontal" | "vertical";
  className?: string;
}) {
  if (orientation === "vertical") {
    return (
      <ol className={cn("flex max-w-[460px] flex-col", className)}>
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;

          return (
            <li key={`${step.label}-${index}`} className="flex gap-3.5">
              <div className="flex flex-col items-center">
                <StepMarker step={step} index={index} size="sm" />
                {!isLast ? (
                  <span
                    className={cn(
                      "my-1 w-0.5 flex-1",
                      step.state === "done" ? "bg-gold-400" : "bg-neutral-200"
                    )}
                  />
                ) : null}
              </div>
              <div className={cn(!isLast ? "pb-[22px]" : undefined)}>
                <div
                  className={cn(
                    "text-[13px]",
                    step.state === "todo"
                      ? "font-semibold text-[#AEB4C4]"
                      : "font-bold text-ink"
                  )}
                >
                  {step.label}
                </div>
                {step.description ? (
                  <div className="mt-0.5 text-xs text-ink-faint">{step.description}</div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <ol className={cn("flex max-w-[820px] items-start", className)}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const connectorDone = step.state === "done";

        return (
          <li key={`${step.label}-${index}`} className="flex min-w-0 flex-1 items-start">
            <div className="flex flex-1 flex-col items-center">
              <StepMarker step={step} index={index} size="md" />
              <span
                className={cn(
                  "mt-2 text-center text-[11.5px]",
                  step.state === "todo"
                    ? "text-[#AEB4C4]"
                    : step.state === "current"
                      ? "font-bold text-ink"
                      : "font-semibold text-ink"
                )}
              >
                {step.label}
              </span>
              {step.description ? (
                <span className="mt-0.5 text-center text-[11px] text-ink-faint">
                  {step.description}
                </span>
              ) : null}
            </div>
            {!isLast ? (
              <span
                className={cn(
                  "mt-[13px] h-0.5 min-w-4 flex-1",
                  connectorDone ? "bg-gold-400" : "bg-neutral-200"
                )}
                aria-hidden
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function StepMarker({
  step,
  index,
  size,
}: {
  step: StepperStep;
  index: number;
  size: "sm" | "md";
}) {
  const dim = size === "md" ? "h-[26px] w-[26px] text-[13px]" : "h-6 w-6 text-xs";
  const number = String(index + 1);

  if (step.state === "done") {
    return (
      <span
        className={cn(
          "flex items-center justify-center rounded-full bg-gold-400 font-bold text-navy-950",
          dim
        )}
        aria-current={undefined}
      >
        ✓
      </span>
    );
  }

  if (step.state === "current") {
    return (
      <span
        className={cn(
          "flex items-center justify-center rounded-full border-[2.5px] border-gold-400 bg-[#FFF7E8] font-bold text-gold-600",
          dim
        )}
        aria-current="step"
      >
        {number}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-full border-2 border-neutral-300 text-[#AEB4C4]",
        dim
      )}
    >
      {size === "sm" ? number : null}
    </span>
  );
}
