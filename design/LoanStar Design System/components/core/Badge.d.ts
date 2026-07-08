import type { ReactNode, CSSProperties } from "react";

export interface BadgeProps {
  children: ReactNode;
  /** Maps to a LoanStar semantic status color. See docs/LoanStar_System_Design.md §5.4 for the full status→color table. */
  status?: "registered" | "pending" | "submitted" | "approved" | "active" | "denied" | "overdue" | "closed";
  /** Show the leading color dot (default true). */
  dot?: boolean;
  style?: CSSProperties;
}
