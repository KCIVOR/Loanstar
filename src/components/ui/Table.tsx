import type { ReactNode } from "react";
import { cn } from "./cn";

/* Meridian §08 table — .table-wrap frame + .tbl ledger table.
   `num` on Th/Td right-aligns and sets the mono ledger face. */
export function Table({
  children,
  className = "",
}: {
  children: ReactNode;
  variant?: "default" | "navy";
  className?: string;
}) {
  return (
    <div className={cn("table-wrap", className)}>
      <table className="tbl">{children}</table>
    </div>
  );
}

export function Th({
  children,
  num = false,
  className = "",
  onClick,
}: {
  children: ReactNode;
  variant?: "default" | "navy";
  num?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <th
      className={cn(num && "num", className) || undefined}
      onClick={onClick}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  num = false,
  className = "",
  colSpan,
}: {
  children: ReactNode;
  variant?: "default" | "navy";
  num?: boolean;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      className={cn(num && "num", className) || undefined}
      colSpan={colSpan}
    >
      {children}
    </td>
  );
}
