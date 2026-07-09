import type { SelectHTMLAttributes } from "react";
import { cn } from "./cn";

export function Select({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-md border border-neutral-300 bg-field-bg px-3.5 text-sm text-ink focus:border-gold-400 focus:bg-white focus:outline-none focus:ring-[3px] focus:ring-gold-400/20 disabled:cursor-not-allowed disabled:border-neutral-100 disabled:bg-neutral-100 disabled:text-neutral-400",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}
