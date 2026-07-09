import { cn } from "./cn";

function Bone({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "animate-pulse rounded bg-neutral-100",
        className
      )}
    />
  );
}

function BoneDark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "animate-pulse rounded bg-navy-700",
        className
      )}
    />
  );
}

export function Skeleton({
  variant = "line",
  className = "",
}: {
  variant?: "line" | "list-row" | "kpi";
  className?: string;
}) {
  if (variant === "list-row") {
    return (
      <div
        className={cn("flex items-center gap-3", className)}
        aria-hidden
      >
        <Bone className="h-9 w-9 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Bone className="h-[11px] w-[38%] rounded" />
          <Bone className="h-[9px] w-[58%] rounded" />
        </div>
        <Bone className="h-[22px] w-16 shrink-0 rounded-full" />
      </div>
    );
  }

  if (variant === "kpi") {
    return (
      <div
        className={cn(
          "rounded-xl border border-navy-border bg-navy-800 px-5 py-[18px]",
          className
        )}
        aria-hidden
      >
        <BoneDark className="block h-[9px] w-1/2" />
        <BoneDark className="mt-2.5 block h-6 w-[65%] rounded-md" />
        <BoneDark className="mt-2.5 block h-[9px] w-[70%]" />
      </div>
    );
  }

  return (
    <div
      className={cn("flex flex-col gap-2", className)}
      aria-hidden
    >
      <Bone className="h-[11px] w-[90%]" />
      <Bone className="h-[11px] w-full" />
      <Bone className="h-[11px] w-3/4" />
    </div>
  );
}
