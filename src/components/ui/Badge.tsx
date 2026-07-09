import type { ReactNode } from "react";
import { cn } from "./cn";

const variants = {
  success: "bg-success-100 text-success-ink",
  warning: "bg-warning-100 text-warning-ink",
  danger: "bg-danger-100 text-danger-ink",
  info: "bg-info-100 text-info-ink",
  neutral: "bg-neutral-100 text-neutral-700",
  gold: "bg-gold-400/16 text-gold-600",
  pending: "bg-warning-100 text-warning-ink",
  inactive: "bg-neutral-100 text-ink-muted",
} as const;

export function Badge({
  children,
  variant = "neutral",
}: {
  children: ReactNode;
  variant?: keyof typeof variants;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-[3px] text-[11px] font-bold",
        variants[variant]
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? "success" : "inactive"}>
      {active ? "Active" : "Inactive"}
    </Badge>
  );
}
