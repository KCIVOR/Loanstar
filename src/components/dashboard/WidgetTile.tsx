"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type Tone = "default" | "gold" | "danger" | "success";

function toneClass(tone: Tone): string {
  return tone === "gold"
    ? "text-gold-600"
    : tone === "danger"
      ? "text-danger-ink"
      : tone === "success"
        ? "text-success-ink"
        : "text-ink";
}

/** Full-width module heading — link to the portal, plus a short hint. */
export function SectionHeader({
  title,
  href,
  hint,
}: {
  title: string;
  href: string;
  hint?: string;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <Link
        href={href}
        className="group inline-flex items-center gap-1.5 text-[15px] font-bold text-ink hover:text-gold-600"
      >
        {title}
        <span
          aria-hidden
          className="text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-gold-600"
        >
          →
        </span>
      </Link>
      {hint ? <span className="text-xs text-ink-faint">{hint}</span> : null}
    </div>
  );
}

/** A single white-surface stat card for dashboard modules (not the navy ui/KpiCard). */
export function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="min-w-[132px] flex-1 rounded-[12px] border border-neutral-200 bg-white p-4 shadow-xs">
      <p className="truncate text-[10.5px] font-semibold uppercase tracking-[0.05em] text-ink-faint">
        {label}
      </p>
      <p className={`mt-1 font-display text-2xl font-semibold leading-tight ${toneClass(tone)}`}>
        {value}
      </p>
    </div>
  );
}

/** A single chart, as its own bordered card. `size` controls its share of the row. */
export function ChartCard({
  title,
  caption,
  size = "half",
  children,
}: {
  title: string;
  caption?: string;
  size?: "half" | "full";
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-[12px] border border-neutral-200 bg-white p-4 shadow-xs ${
        size === "full" ? "md:col-span-2" : ""
      }`}
    >
      <p className="mb-2 text-[11px] font-semibold text-ink-muted">{title}</p>
      {children}
      {caption ? <p className="mt-1.5 text-[10px] text-ink-faint">{caption}</p> : null}
    </div>
  );
}

/** A small data table, as its own bordered card. */
export function TableCard<T>({
  title,
  columns,
  rows,
  renderRow,
  emptyText = "No data yet.",
}: {
  title: string;
  columns: string[];
  rows: T[];
  renderRow: (row: T, i: number) => ReactNode;
  emptyText?: string;
}) {
  return (
    <div className="rounded-[12px] border border-neutral-200 bg-white p-4 shadow-xs md:col-span-2">
      <p className="mb-2 text-[11px] font-semibold text-ink-muted">{title}</p>
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-[11.5px]">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="pb-2 pr-3 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-ink-faint"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((row, i) => renderRow(row, i))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyNote>{emptyText}</EmptyNote>
      )}
    </div>
  );
}

/** KPI row + chart/table grid for one module's section. */
export function CardGrid({ children }: { children: ReactNode }) {
  return <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">{children}</div>;
}

export function KpiRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-3">{children}</div>;
}

/** Wraps one module's section: heading + loading/error/content states. */
export function WidgetSection({
  title,
  href,
  hint,
  error = false,
  onRetry,
  children,
  className = "",
}: {
  title: string;
  href: string;
  hint?: string;
  error?: boolean;
  onRetry?: () => void;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <SectionHeader title={title} href={href} hint={hint} />
      {error ? (
        <div className="flex flex-col items-start gap-2 rounded-[12px] border border-neutral-200 bg-white p-4 shadow-xs">
          <p className="text-xs text-danger-ink">Couldn&apos;t load this section.</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="text-xs font-semibold text-gold-600 hover:underline"
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

/** Pulsing gray block — base unit for all skeletons. */
function Bone({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-neutral-200 ${className}`} />;
}

export function KpiCardSkeleton() {
  return (
    <div className="min-w-[132px] flex-1 rounded-[12px] border border-neutral-200 bg-white p-4 shadow-xs">
      <Bone className="h-2.5 w-16" />
      <Bone className="mt-2.5 h-6 w-12" />
    </div>
  );
}

export function ChartCardSkeleton({ size = "half" }: { size?: "half" | "full" }) {
  return (
    <div
      className={`rounded-[12px] border border-neutral-200 bg-white p-4 shadow-xs ${
        size === "full" ? "md:col-span-2" : ""
      }`}
    >
      <Bone className="h-2.5 w-28" />
      <Bone className="mt-3 h-[140px] w-full" />
    </div>
  );
}

export function TableCardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-[12px] border border-neutral-200 bg-white p-4 shadow-xs md:col-span-2">
      <Bone className="h-2.5 w-24" />
      <div className="mt-3 space-y-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <Bone key={i} className="h-3 w-full" />
        ))}
      </div>
    </div>
  );
}

/** Skeleton shaped like a module's actual card layout, to avoid loading-state jump. */
export function SectionSkeleton({
  kpis,
  charts,
  table = false,
}: {
  kpis: number;
  charts: Array<"half" | "full">;
  table?: boolean;
}) {
  return (
    <>
      <KpiRow>
        {Array.from({ length: kpis }).map((_, i) => (
          <KpiCardSkeleton key={i} />
        ))}
      </KpiRow>
      {charts.length > 0 || table ? (
        <CardGrid>
          {charts.map((size, i) => (
            <ChartCardSkeleton key={i} size={size} />
          ))}
          {table ? <TableCardSkeleton /> : null}
        </CardGrid>
      ) : null}
    </>
  );
}

export function EmptyNote({ children = "No data yet." }: { children?: ReactNode }) {
  return (
    <div className="flex items-center justify-center py-6">
      <p className="text-xs text-ink-faint">{children}</p>
    </div>
  );
}
