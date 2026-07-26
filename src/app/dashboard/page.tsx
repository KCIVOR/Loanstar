"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Alert, Button, PageHeader } from "@/components/ui";
import { DASHBOARD_WIDGETS, isWidgetSlug, WIDGET_SKELETON } from "@/components/dashboard/registry";
import { SectionSkeleton, WidgetSection } from "@/components/dashboard/WidgetTile";
import { MODULES, type ModuleSlug } from "@/lib/constants";
import { isWidgetError, type WidgetsResponse } from "@/lib/dashboard/types";
import { MODULE_HOME_PATHS } from "@/lib/permissions/home";
import { usePermissions } from "@/hooks/usePermissions";

export default function DashboardPage() {
  const { permissions, loading, error, isSuperAdmin } = usePermissions();
  const [widgets, setWidgets] = useState<WidgetsResponse["widgets"] | null>(null);
  const [widgetsLoading, setWidgetsLoading] = useState(true);
  const [widgetsError, setWidgetsError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const loadWidgets = useCallback(() => {
    setWidgetsLoading(true);
    setWidgetsError(false);
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/widgets");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as WidgetsResponse;
        if (!cancelled) setWidgets(body.widgets);
      } catch {
        if (!cancelled) setWidgetsError(true);
      } finally {
        if (!cancelled) setWidgetsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  if (loading) return null;
  if (error) {
    return (
      <div className="text-sm text-danger">Failed to load permissions: {error}</div>
    );
  }

  const visibleModules = MODULES.filter((mod) =>
    permissions?.modules.some((m) => m.moduleSlug === mod.slug && m.canView),
  );
  const orderedModules = [
    ...visibleModules.filter((m) => m.slug === "reports"),
    ...visibleModules.filter((m) => m.slug !== "reports"),
  ];
  const widgetModules = orderedModules.filter((m) => isWidgetSlug(m.slug as ModuleSlug));
  const plainModules = orderedModules.filter((m) => !isWidgetSlug(m.slug as ModuleSlug));

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={
          isSuperAdmin
            ? "Super Admin — full system access"
            : "Live overview of your modules"
        }
        actions={
          <p className="text-xs text-ink-400">
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
        }
      />

      {widgetsError ? (
        <div className="mb-4">
          <Alert variant="error">
            <span className="inline-flex flex-wrap items-center gap-2">
              Couldn&apos;t load dashboard data.
              <Button variant="ghost" size="sm" onClick={loadWidgets}>
                Retry
              </Button>
            </span>
          </Alert>
        </div>
      ) : null}

      <div className="flex flex-col gap-8">
        {widgetModules.map((mod) => {
          const slug = mod.slug as ModuleSlug;
          const href = MODULE_HOME_PATHS[slug] ?? "/dashboard";
          const data = widgets?.[slug];
          const failed = data != null && isWidgetError(data);

          return (
            <WidgetSection
              key={slug}
              title={mod.name}
              href={href}
              hint={mod.description}
              error={failed}
              onRetry={loadWidgets}
            >
              {widgetsLoading && data == null ? (
                <SectionSkeleton {...WIDGET_SKELETON[slug as keyof typeof WIDGET_SKELETON]} />
              ) : data != null && !isWidgetError(data) ? (
                (() => {
                  const Widget = DASHBOARD_WIDGETS[slug as keyof typeof DASHBOARD_WIDGETS] as React.ComponentType<{
                    data: typeof data;
                  }>;
                  return <Widget data={data} />;
                })()
              ) : null}
            </WidgetSection>
          );
        })}

        {plainModules.length > 0 ? (
          <div className="flex flex-wrap gap-3.5">
            {plainModules.map((mod) => {
              const slug = mod.slug as ModuleSlug;
              const href = MODULE_HOME_PATHS[slug] ?? "/dashboard";
              return (
                <Link
                  key={slug}
                  href={href}
                  className="card group min-w-[220px] flex-1 p-4 transition-shadow hover:shadow-[var(--sh-2)]"
                >
                  <h2 className="text-[13.5px] font-bold text-ink-900 group-hover:text-teal-700">
                    {mod.name} <span aria-hidden>→</span>
                  </h2>
                  <p className="mt-1 text-xs text-ink-400">{mod.description}</p>
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>

      {visibleModules.length === 0 ? (
        <div className="mt-4 flex flex-col items-start gap-3">
          <p className="text-sm text-ink-500">
            No modules visible. Contact an administrator to assign roles.
          </p>
          <Button variant="outline" size="sm" onClick={loadWidgets}>
            Refresh
          </Button>
        </div>
      ) : null}
    </div>
  );
}
