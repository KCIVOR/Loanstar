"use client";

import type { ReactNode } from "react";
import { cn } from "./cn";

export function Chip({
  selected,
  onClick,
  children,
  disabled = false,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-[11.5px] transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "border-[1.5px] border-gold-400 bg-gold-400/12 font-bold text-warning-ink"
          : "border border-neutral-300 text-ink-muted hover:border-neutral-400"
      )}
    >
      {selected ? <span className="mr-1" aria-hidden>✓</span> : null}
      {children}
    </button>
  );
}
