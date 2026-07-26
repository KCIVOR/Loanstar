"use client";

import type { ReactNode } from "react";
import { useId, useState } from "react";
import { cn } from "./cn";

/* Meridian §07 tooltip — navy-950 bubble with caret. */
export function Tooltip({
  content,
  children,
  className = "",
}: {
  content: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <span
      className={cn("tip", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span aria-describedby={open ? id : undefined}>{children}</span>
      {open ? (
        <span id={id} role="tooltip" className="tip-box">
          {content}
        </span>
      ) : null}
    </span>
  );
}
