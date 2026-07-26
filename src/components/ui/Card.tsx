import type { ReactNode } from "react";
import { cn } from "./cn";

/* Meridian §08 card. Legacy variant keys map onto Meridian surfaces:
   base/highlight → white card; warning/danger → card tinted with the semantic
   alert tokens; gradient/kpi → navy-950 panel (per EMI output panel). */
const variants = {
  base: "card card-pad",
  highlight: "card card-pad border-l-2 !border-l-teal-600",
  warning: "card card-pad !bg-warning-bg !border-warning-line",
  danger: "card card-pad !bg-danger-bg !border-danger-line",
  gradient: "card-pad rounded-[var(--r-lg)] bg-navy-950 text-white",
  kpi: "card-pad rounded-[var(--r-lg)] bg-navy-950 text-white",
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
  return <div className={cn(variants[variant], className)}>{children}</div>;
}
