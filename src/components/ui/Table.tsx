import type { ReactNode } from "react";
import { cn } from "./cn";

export function Table({
  children,
  variant = "default",
}: {
  children: ReactNode;
  variant?: "default" | "navy";
}) {
  const wrapper =
    variant === "navy"
      ? "overflow-x-auto rounded-xl border border-navy-border bg-navy-800"
      : "overflow-x-auto rounded-xl border border-neutral-200 bg-white";
  return (
    <div className={wrapper}>
      <table className="min-w-full divide-y divide-neutral-100 text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  variant = "default",
}: {
  children: ReactNode;
  variant?: "default" | "navy";
}) {
  const styles =
    variant === "navy"
      ? "bg-navy-700/50 px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-navy-muted"
      : "bg-neutral-50 px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-ink-faint";
  return <th className={styles}>{children}</th>;
}

export function Td({
  children,
  className = "",
  variant = "default",
}: {
  children: ReactNode;
  className?: string;
  variant?: "default" | "navy";
}) {
  const styles =
    variant === "navy"
      ? "border-b border-navy-border px-4 py-3 text-[#F4F1E8]"
      : "border-b border-neutral-100 px-4 py-3 text-ink-muted";
  return <td className={cn(styles, className)}>{children}</td>;
}
