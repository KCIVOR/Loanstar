import { AppShell } from "@/components/admin/AppShell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell title="Dashboard">{children}</AppShell>;
}
