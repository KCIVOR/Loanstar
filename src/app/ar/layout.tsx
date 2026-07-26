import { AppShell } from "@/components/admin/AppShell";

export default function ArLayout({ children }: { children: React.ReactNode }) {
  return <AppShell title="Accounting (AR)">{children}</AppShell>;
}
