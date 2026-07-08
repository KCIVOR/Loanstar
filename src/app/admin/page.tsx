"use client";

import { MODULES } from "@/lib/constants";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, PageHeader, Spinner } from "@/components/admin/ui";

export default function AdminDashboardPage() {
  const { permissions, loading, error, isSuperAdmin } = usePermissions();

  if (loading) return <Spinner />;
  if (error) {
    return (
      <div className="text-sm text-red-600">
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
              <h2 className="font-medium text-zinc-900">{mod.name}</h2>
              <p className="mt-1 text-sm text-zinc-500">{mod.description}</p>
              {perm ? (
                <div className="mt-3 flex flex-wrap gap-1">
                  {perm.canView ? (
                    <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                      view
                    </span>
                  ) : null}
                  {perm.canCreate ? (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
                      create
                    </span>
                  ) : null}
                  {perm.canEdit ? (
                    <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                      edit
                    </span>
                  ) : null}
                  {perm.canDelete ? (
                    <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">
                      delete
                    </span>
                  ) : null}
                  {perm.canExecuteTrigger ? (
                    <span className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                      trigger
                    </span>
                  ) : null}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      {visibleModules.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">
          No modules visible. Contact an administrator to assign roles.
        </p>
      ) : null}
    </div>
  );
}
