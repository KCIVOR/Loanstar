"use client";

import { useCallback, useState, type ReactNode } from "react";

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
  const [mobileOpen, setMobileOpen] = useState(false);
  const onMobileOpenChange = useCallback((open: boolean) => {
    setMobileOpen(open);
  }, []);

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <Sidebar mobileOpen={mobileOpen} onMobileOpenChange={onMobileOpenChange} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface">
        <Header
          title={title}
          links={links}
          onOpenNav={() => setMobileOpen(true)}
        />
        {/* `relative` makes main the containing block for absolutely positioned
            descendants (e.g. sr-only file inputs), so they scroll with the main
            area instead of adding phantom height to the document. */}
        <main className="relative flex-1 overflow-y-auto bg-canvas p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
