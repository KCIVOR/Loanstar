import type { LabelHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export function Label({
  children,
  className = "",
  ...props
}: LabelHTMLAttributes<HTMLLabelElement> & { children: ReactNode }) {
  return (
    <label
      className={cn("mb-1.5 block text-[13px] font-medium text-ink-muted", className)}
      {...props}
    >
      {children}
    </label>
  );
}
