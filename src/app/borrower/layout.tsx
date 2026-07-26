"use client";

import { AppShell } from "@/components/admin/AppShell";

export default function BorrowerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell title="Borrower Portal">{children}</AppShell>;
}
