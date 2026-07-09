import type { ReactNode } from "react";
import { cn } from "./cn";

export function KpiCard({
  label,
  value,
  hint,
  highlight = false,
  alert = false,
  className = "",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  highlight?: boolean;
  alert?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-[18px] py-4",
        alert
          ? "border-navy-border bg-gradient-to-br from-[#1B3B74] to-navy-800"
          : "border-navy-border bg-navy-800",
        className
      )}
    >
      <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-navy-subtle">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 font-mono text-[26px] leading-none",
          highlight ? "text-gold-300" : alert ? "text-[#E9948A]" : "text-cream"
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-navy-subtle">{hint}</p> : null}
    </div>
  );
}
