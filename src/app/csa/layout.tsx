import { AppShell } from "@/components/admin/AppShell";

export default function CsaLayout({ children }: { children: React.ReactNode }) {
  return <AppShell title="CSA Portal">{children}</AppShell>;
}
