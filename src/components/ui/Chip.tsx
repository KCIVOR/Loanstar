"use client";

import type { ReactNode } from "react";
import { cn } from "./cn";

/* Meridian §15 filter chip — navy tint when active. */
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
      className={cn("fchip", selected && "is-on", disabled && "opacity-50")}
    >
      {children}
    </button>
  );
}
