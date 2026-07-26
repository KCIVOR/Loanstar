import { AppShell } from "@/components/admin/AppShell";

export default function CigLayout({ children }: { children: React.ReactNode }) {
  return <AppShell title="CIG Verification">{children}</AppShell>;
}
