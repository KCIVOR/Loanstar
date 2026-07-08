"use client";

import { MODULES } from "@/lib/constants";
import { usePermissions } from "@/hooks/usePermissions";
import { Badge, Card, PageHeader, Spinner } from "@/components/admin/ui";

export default function DashboardPage() {
  const { permissions, loading, error, isSuperAdmin } = usePermissions();

  if (loading) return <Spinner />;
  if (error) {
    return (
      <div className="text-sm text-danger-600">
        Failed to load permissions: {error}
      </div>
    );
  }

  const visibleModules = MODULES.filter((mod) =>
    permissions?.modules.some(
      (m) => m.moduleSlug === mod.slug && m.canView,
    ),
  );

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={
          isSuperAdmin
            ? "Super Admin — full system access"
            : "Modules visible to your assigned roles"
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleModules.map((mod) => {
          const perm = permissions?.modules.find(
            (m) => m.moduleSlug === mod.slug,
          );
          return (
            <Card key={mod.slug}>
              <h2 className="font-medium text-neutral-900">{mod.name}</h2>
              <p className="mt-1 text-sm text-neutral-500">{mod.description}</p>
              {perm ? (
                <div className="mt-3 flex flex-wrap gap-1">
                  {perm.canView ? <Badge variant="neutral">view</Badge> : null}
                  {perm.canCreate ? (
                    <Badge variant="success">create</Badge>
                  ) : null}
                  {perm.canEdit ? <Badge variant="info">edit</Badge> : null}
                  {perm.canDelete ? (
                    <Badge variant="danger">delete</Badge>
                  ) : null}
                  {perm.canExecuteTrigger ? (
                    <Badge variant="gold">trigger</Badge>
                  ) : null}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      {visibleModules.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">
          No modules visible. Contact an administrator to assign roles.
        </p>
      ) : null}
    </div>
  );
}
