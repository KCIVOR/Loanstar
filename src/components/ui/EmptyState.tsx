import type { ReactNode } from "react";
import { cn } from "./cn";

/* Meridian §08 empty state — dashed frame, navy icon tile, action button. */
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
    <div className={cn("empty", className)}>
      {showMark ? (
        <span className="ic" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
            <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
          </svg>
        </span>
      ) : null}
      <h4>{title}</h4>
      {description ? <p>{description}</p> : null}
      {action ? <div>{action}</div> : null}
    </div>
  );
}
