import type { ReactNode } from "react";
import { cn } from "./cn";

/* Meridian §06 badges. Legacy keys map onto Meridian classes:
   info → badge-navy, gold → badge-teal, pending → badge-warning,
   inactive → badge-neutral. `dot` adds the status dot. */
const variants = {
  success: "badge-success",
  warning: "badge-warning",
  danger: "badge-danger",
  info: "badge-navy",
  navy: "badge-navy",
  teal: "badge-teal",
  neutral: "badge-neutral",
  solid: "badge-solid",
  gold: "badge-teal",
  pending: "badge-warning",
  inactive: "badge-neutral",
} as const;

export function Badge({
  children,
  variant = "neutral",
  dot = false,
  className = "",
}: {
  children: ReactNode;
  variant?: keyof typeof variants;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("badge", variants[variant], className)}>
      {dot ? <i className="dot" /> : null}
      {children}
    </span>
  );
}

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? "success" : "inactive"} dot>
      {active ? "Active" : "Inactive"}
    </Badge>
  );
}
