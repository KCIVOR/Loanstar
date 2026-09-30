import { redirect } from "next/navigation";

import { requireSuperAdmin } from "@/lib/legacy-import/server";

/** Super-admin-only gate for the legacy import dry run (fail-closed). */
export default async function LegacyImportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let allowed = false;
  try {
    await requireSuperAdmin();
    allowed = true;
  } catch {
    allowed = false;
  }
  if (!allowed) redirect("/access-denied");
  return <>{children}</>;
}
