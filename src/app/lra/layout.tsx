import { AppShell } from "@/components/admin/AppShell";

export default function LraLayout({ children }: { children: React.ReactNode }) {
  return <AppShell title="LRA Release">{children}</AppShell>;
}
