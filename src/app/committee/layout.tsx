import { AppShell } from "@/components/admin/AppShell";

export default function CommitteeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell title="Committee">{children}</AppShell>;
}
