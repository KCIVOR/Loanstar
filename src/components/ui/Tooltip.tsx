"use client";

import type { ReactNode } from "react";
import { useId, useState } from "react";
import { cn } from "./cn";

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
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span aria-describedby={open ? id : undefined}>{children}</span>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="absolute bottom-[calc(100%+10px)] left-0 z-50 whitespace-nowrap rounded-[7px] bg-ink px-[11px] py-[7px] text-[11.5px] text-[#F4F1E8] shadow-[0_6px_16px_rgba(15,33,72,0.25)]"
        >
          {content}
          <span
            className="absolute -bottom-1 left-4 h-2 w-2 rotate-45 bg-ink"
            aria-hidden
          />
        </span>
      ) : null}
    </span>
  );
}
