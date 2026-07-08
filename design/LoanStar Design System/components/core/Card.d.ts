import type { ReactNode, CSSProperties, HTMLAttributes } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: "base" | "highlight" | "warning" | "danger" | "gradient";
  style?: CSSProperties;
}

export interface StatCardProps {
  label: string;
  value: string;
  trend?: string;
  trendPositive?: boolean;
  sub?: string;
}
