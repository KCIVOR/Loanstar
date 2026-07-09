"use client";

import { cn } from "./cn";

export function Toast({
  message,
  variant = "success",
  onClose,
}: {
  message: string;
  variant?: "success" | "error";
  onClose?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-[13px] shadow-md",
        variant === "success"
          ? "border-success/30 bg-white text-success-ink"
          : "border-danger/30 bg-white text-danger-ink"
      )}
      role="status"
    >
      <span>{message}</span>
      {onClose ? (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onClose}
          className="text-ink-faint hover:text-ink"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}
