import type { ReactNode } from "react";
import { cn } from "./cn";

/* Meridian §07 alerts — semantic surface, icon, title + body. */
const variants = {
  success: "alert-success",
  warning: "alert-warning",
  error: "alert-danger",
  danger: "alert-danger",
  info: "alert-info",
} as const;

const icons: Record<keyof typeof variants, ReactNode> = {
  info: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  ),
  success: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m9 11 3 3L22 4" />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6M9 9l6 6" />
    </svg>
  ),
  danger: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6M9 9l6 6" />
    </svg>
  ),
};

export function Alert({
  children,
  title,
  variant = "error",
  className = "",
}: {
  children: ReactNode;
  title?: string;
  variant?: keyof typeof variants;
  className?: string;
}) {
  return (
    <div className={cn("alert", variants[variant], className)}>
      {icons[variant]}
      <div className="alert-body">
        {title ? <b>{title}</b> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}
