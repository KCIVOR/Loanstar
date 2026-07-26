import { cn } from "./cn";

/* Meridian §08 skeleton — shimmering .skel blocks. */
function Bone({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <span className={cn("skel block", className)} style={style} />;
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
      <div className={cn("flex items-center gap-3", className)} aria-hidden>
        <Bone className="h-9 w-9 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Bone className="h-[11px] w-[38%]" />
          <Bone className="h-[9px] w-[58%]" />
        </div>
        <Bone className="h-[22px] w-16 shrink-0 rounded-full" />
      </div>
    );
  }

  if (variant === "kpi") {
    return (
      <div className={cn("card stat", className)} aria-hidden>
        <Bone className="h-[10px] w-1/2" />
        <Bone className="mt-2.5 h-7 w-[65%]" />
        <Bone className="mt-2.5 h-[10px] w-[70%]" />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)} aria-hidden>
      <Bone className="h-[11px] w-[90%]" />
      <Bone className="h-[11px] w-full" />
      <Bone className="h-[11px] w-3/4" />
    </div>
  );
}
