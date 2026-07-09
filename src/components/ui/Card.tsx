import type { ReactNode } from "react";
import { cn } from "./cn";

const variants = {
  base: "rounded-xl border border-neutral-200 bg-white shadow-sm",
  highlight:
    "rounded-xl border border-gold-400/40 border-l-2 border-l-gold-400 bg-gradient-to-br from-primary-50 to-white shadow-sm",
  warning:
    "rounded-xl border border-warning-100 border-l-2 border-l-warning bg-warning-50 shadow-sm",
  danger:
    "rounded-xl border border-danger-100 border-l-2 border-l-danger bg-danger-50 shadow-sm",
  gradient:
    "rounded-xl bg-gradient-to-br from-navy-700 to-navy-900 text-white shadow-sm",
  kpi: "rounded-xl border border-navy-border bg-navy-800 text-white shadow-sm",
} as const;

export function Card({
  children,
  variant = "base",
  className = "",
}: {
  children: ReactNode;
  variant?: keyof typeof variants;
  className?: string;
}) {
  return (
    <div className={cn("p-6", variants[variant], className)}>{children}</div>
  );
}
