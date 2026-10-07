import Link from "next/link";

import { AppShell } from "@/components/admin/AppShell";
import { BugReports } from "@/components/bug-reports/BugReports";
import { isSuperAdmin, requireAuth } from "@/lib/permissions/server";

export default async function BugReportsPage() {
  const user = await requireAuth();
  const admin = await isSuperAdmin(user.id);
  return (
    <AppShell title="Report a bug">
      {admin && (
        <div className="mx-auto mb-4 max-w-5xl">
          <Link href="/admin/bug-reports" className="text-sm font-semibold text-teal-700 hover:underline">
            View admin bug queue
          </Link>
        </div>
      )}
      <BugReports />
    </AppShell>
  );
}
