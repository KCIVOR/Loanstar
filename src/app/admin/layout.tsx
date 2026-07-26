import { AppShell } from "@/components/admin/AppShell";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell title="Admin Console">{children}</AppShell>;
}
