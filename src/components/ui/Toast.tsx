"use client";

/* Meridian §07 toast — navy-950 surface, teal icon (danger icon for errors). */
export function Toast({
  message,
  title,
  variant = "success",
  onClose,
}: {
  message: string;
  title?: string;
  variant?: "success" | "error";
  onClose?: () => void;
}) {
  return (
    <div className="toast" role="status">
      {variant === "success" ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <path d="m9 11 3 3L22 4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ color: "var(--danger)" }}>
          <circle cx="12" cy="12" r="10" />
          <path d="m15 9-6 6M9 9l6 6" />
        </svg>
      )}
      <div>
        {title ? <b>{title}</b> : null}
        <span>{message}</span>
      </div>
      {onClose ? (
        <button type="button" className="x" aria-label="Dismiss" onClick={onClose}>
          ×
        </button>
      ) : null}
    </div>
  );
}
