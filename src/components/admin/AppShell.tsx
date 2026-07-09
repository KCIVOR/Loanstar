"use client";

import type { ReactNode } from "react";

import { Header, type HeaderLink } from "./Header";
import { Sidebar } from "./Sidebar";

export function AppShell({
  title,
  links,
  children,
}: {
  title: string;
  links?: HeaderLink[];
  children: ReactNode;
}) {
  return (
    <div className="flex h-dvh overflow-hidden bg-neutral-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-neutral-0 pt-14 lg:pt-0">
        <Header title={title} links={links} />
        <main className="flex-1 overflow-y-auto bg-neutral-50 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
