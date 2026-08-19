"use client";

import { LineMini } from "@/components/dashboard/charts";
import { CATEGORY_COLORS } from "@/components/dashboard/charts/theme";
import { peso } from "@/components/dashboard/widgets/format";
import type { Coverage, TrendSeries } from "@/lib/reports/trends";

/** Pesos and percentages cannot share a y-axis without one of them looking
 *  flat, so a chart only ever draws series that agree on unit. */
export function seriesByUnit(series: TrendSeries[], unit: TrendSeries["unit"]) {
  return series.filter((s) => s.unit === unit);
}

export function formatTrendValue(value: number | null, unit: TrendSeries["unit"]): string {
  if (value === null) return "—";
  if (unit === "php") return peso(value);
  if (unit === "percent") return `${value}%`;
  if (unit === "days") return `${value}d`;
  return value.toLocaleString("en-PH");
}

export function TrendChart({
  series,
  coverage,
  height = 180,
}: {
  series: TrendSeries[];
  coverage?: Coverage;
  height?: number;
}) {
  if (series.length === 0) return null;

  const months = series[0]!.points.map((p) => p.label);
  const data = months.map((label, index) => {
    const row: Record<string, string | number | null> = { label };
    for (const s of series) row[s.id] = s.points[index]?.value ?? null;
    return row;
  });

  const hasAnyValue = series.some((s) => s.points.some((p) => p.value !== null));

  return (
    <div>
      <LineMini
        data={data}
        xKey="label"
        height={height}
        showLegend={series.length > 1}
        lines={series.map((s, i) => ({
          key: s.id,
          name: s.label,
          color: CATEGORY_COLORS[i % CATEGORY_COLORS.length]!,
        }))}
      />
      {!hasAnyValue && (
        <p className="text-xs text-[var(--ink-400)]">Nothing recorded in this window.</p>
      )}
      {coverage?.note && (
        <p className="mt-1 text-xs text-[var(--ink-400)]">{coverage.note}</p>
      )}
    </div>
  );
}
