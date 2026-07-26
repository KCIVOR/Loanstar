import { AppShell } from "@/components/admin/AppShell";

export default function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell title="Agent Portal">{children}</AppShell>;
}
