import { Suspense } from "react";

import { AppShell } from "@/components/admin/AppShell";
import { ReportsChrome } from "@/components/reports/ReportsChrome";

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell title="Reports">
      <Suspense>
        <ReportsChrome>{children}</ReportsChrome>
      </Suspense>
    </AppShell>
  );
}
