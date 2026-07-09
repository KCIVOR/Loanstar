import type { ReactNode } from "react";
import { cn } from "./cn";

const styles = {
  success: {
    bg: "bg-success-50",
    border: "border-success/30",
    dot: "bg-success",
    text: "text-success-ink",
  },
  warning: {
    bg: "bg-warning-50",
    border: "border-warning/30",
    dot: "bg-warning",
    text: "text-warning-ink",
  },
  error: {
    bg: "bg-danger-50",
    border: "border-danger/30",
    dot: "bg-danger",
    text: "text-danger-ink",
  },
  info: {
    bg: "bg-info-50",
    border: "border-info/30",
    dot: "bg-info",
    text: "text-info-ink",
  },
} as const;

export function Alert({
  children,
  variant = "error",
}: {
  children: ReactNode;
  variant?: keyof typeof styles;
}) {
  const v = styles[variant];
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3.5",
        v.bg,
        v.border
      )}
    >
      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", v.dot)} />
      <div className={cn("text-[13px] leading-relaxed", v.text)}>{children}</div>
    </div>
  );
}
