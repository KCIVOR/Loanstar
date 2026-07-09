import type { ReactNode } from "react";
import { cn } from "./cn";

export function EmptyState({
  title,
  description,
  action,
  showMark = true,
  className = "",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  showMark?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-neutral-200 bg-field-bg px-[30px] py-11 text-center",
        className
      )}
    >
      {showMark ? (
        <span
          className="mx-auto mb-3.5 flex h-11 w-11 items-center justify-center rounded-xl bg-gold-400/12 text-[19px] text-gold-600"
          aria-hidden
        >
          ★
        </span>
      ) : null}
      <div className="text-[14.5px] font-bold text-ink">{title}</div>
      {description ? (
        <div className="mx-auto mt-1.5 max-w-80 text-[12.5px] leading-relaxed text-ink-faint">
          {description}
        </div>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
