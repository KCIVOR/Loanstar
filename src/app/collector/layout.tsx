import { AppShell } from "@/components/admin/AppShell";

export default function CollectorLayout({ children }: { children: React.ReactNode }) {
  return <AppShell title="Collector">{children}</AppShell>;
}
