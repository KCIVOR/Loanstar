import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "./cn";

/* Meridian §05 — 40px hit target, teal focus ring. `mono` for ledger figures. */
export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }
>(function Input({ className = "", mono = false, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn("input", mono && "mono", className)}
      {...props}
    />
  );
});
