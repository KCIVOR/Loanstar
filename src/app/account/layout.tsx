import { AppShell } from "@/components/admin/AppShell";

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell title="Account">{children}</AppShell>;
}
