import type { SelectHTMLAttributes } from "react";
import { cn } from "./cn";

/* Meridian §05 select — custom chevron, teal focus ring. */
export function Select({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn("select", className)} {...props}>
      {children}
    </select>
  );
}
