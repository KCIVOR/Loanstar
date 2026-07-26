import { AppShell } from "@/components/admin/AppShell";

export default function RemedialLayout({ children }: { children: React.ReactNode }) {
  return <AppShell title="Remedial">{children}</AppShell>;
}
