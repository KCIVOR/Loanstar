import { AppShell } from "@/components/admin/AppShell";

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell title="Reports">{children}</AppShell>;
}
