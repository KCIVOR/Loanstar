import type { ReactNode } from "react";

export interface SidebarNavItem {
  id: string;
  label: string;
  /** SVG path `d` attribute, 14x14 viewBox, drawn with the LoanStar 1.5px stroke icon style. */
  icon?: string;
}

export interface SidebarProps {
  items: SidebarNavItem[];
  activeId: string;
  onNavigate?: (item: SidebarNavItem) => void;
  footer?: ReactNode;
  subtitle?: string;
  width?: number;
}

export interface TopBarProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  onBack?: () => void;
}
