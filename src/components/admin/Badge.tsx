import type { ReactNode } from "react";

export function Badge({
  children,
  variant = "neutral",
}: {
  children: ReactNode;
  variant?: "success" | "warning" | "danger" | "info" | "neutral" | "gold";
}) {
  const variants: Record<string, string> = {
    success: "bg-success-50 text-success-700",
    warning: "bg-warning-50 text-warning-700",
    danger: "bg-danger-50 text-danger-700",
    info: "bg-info-50 text-info-700",
    neutral: "bg-neutral-100 text-neutral-600",
    gold: "bg-gold/10 text-gold-dark",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${variants[variant] ?? variants.neutral}`}
    >
      {children}
    </span>
  );
}
