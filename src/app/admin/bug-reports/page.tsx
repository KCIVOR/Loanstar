import { BugReports } from "@/components/bug-reports/BugReports";
import { ForbiddenError, isSuperAdmin, requireAuth } from "@/lib/permissions/server";

export default async function AdminBugReportsPage() {
  const user = await requireAuth();
  if (!(await isSuperAdmin(user.id))) throw new ForbiddenError();
  return <BugReports admin />;
}
