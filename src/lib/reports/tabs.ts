export type ReportTab = {
  href: string;
  label: string;
  exact?: boolean;
};

export const REPORT_TABS: ReportTab[] = [
  { href: "/reports", label: "Snapshot", exact: true },
  { href: "/reports/accounts", label: "Accounts" },
  { href: "/reports/past-due", label: "Past due" },
  { href: "/reports/collections", label: "Collections" },
  { href: "/reports/pipeline", label: "Pipeline" },
  { href: "/reports/insights", label: "Insights" },
];

export function isReportTabActive(pathname: string, tab: ReportTab): boolean {
  if (tab.exact) return pathname === tab.href;
  return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}
