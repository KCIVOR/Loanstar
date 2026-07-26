import type { ReactNode } from "react";
import { cn } from "./cn";

/* Meridian §08 stat card — uppercase key, mono ledger value, delta line.
   `highlight` renders the value in teal, `alert` in danger. */
export function KpiCard({
  label,
  value,
  hint,
  highlight = false,
  alert = false,
  delta,
  className = "",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  highlight?: boolean;
  alert?: boolean;
  delta?: { direction: "up" | "down"; text: ReactNode };
  className?: string;
}) {
  return (
    <div className={cn("card stat", className)}>
      <div className="k">{label}</div>
      <div
        className="v"
        style={
          highlight
            ? { color: "var(--teal-600)" }
            : alert
              ? { color: "var(--danger)" }
              : undefined
        }
      >
        {value}
      </div>
      {delta ? (
        <div className={cn("d", delta.direction)}>
          {delta.direction === "up" ? "▲" : "▼"} {delta.text}
        </div>
      ) : hint ? (
        <div className="d">
          <span>{hint}</span>
        </div>
      ) : null}
    </div>
  );
}
