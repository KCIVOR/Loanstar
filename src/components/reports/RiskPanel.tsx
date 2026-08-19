import Link from "next/link";

import { DonutMini, RankedBarMini } from "@/components/dashboard/charts";
import { CATEGORY_COLORS, CHART } from "@/components/dashboard/charts/theme";
import { peso, pct } from "@/components/dashboard/widgets/format";
import { Button, Card, KpiCard } from "@/components/ui";
import { downloadCsv } from "@/lib/reports/csv";
import { getMetric } from "@/lib/reports/metrics/registry";
import type { RiskSeries } from "@/lib/reports/metrics/risk";
import type { MetricValue } from "@/lib/reports/metrics/types";

function formatByUnit(id: string, value: number): string {
  const def = getMetric(id);
  switch (def?.unit) {
    case "percent":
      return pct(Math.round(value * 10) / 10);
    case "php":
      return peso(value);
    case "count":
    default:
      return String(Math.round(value));
  }
}

function metricById(metrics: MetricValue[], id: string): MetricValue | undefined {
  return metrics.find((m) => m.id === id);
}

function RiskKpiValue({ metric, alertAboveThreshold }: { metric: MetricValue; alertAboveThreshold?: number }) {
  const def = getMetric(metric.id);
  if (!def) return null;
  const alert = alertAboveThreshold !== undefined && metric.value > alertAboveThreshold;
  return (
    <KpiCard
      label={def.label}
      value={formatByUnit(metric.id, metric.value)}
      alert={alert}
    />
  );
}

export function RiskPanel({
  metrics,
  series,
  par30Href,
}: {
  metrics: MetricValue[];
  series: RiskSeries;
  par30Href?: string;
}) {
  const par30 = metricById(metrics, "risk.par30");
  const par90 = metricById(metrics, "risk.par90");
  const top10Concentration = metricById(metrics, "risk.top10Concentration");
  const recoveryRate = metricById(metrics, "risk.remedialRecoveryRate");
  const rolloverCount = metricById(metrics, "risk.rolloverCount");

  const agingData = series.aging.map((row) => ({
    label: row.label,
    outstanding: row.outstanding,
    color: row.color,
  }));
  const top10Data = series.top10.map((row) => ({
    name: row.name,
    outstanding: row.outstanding,
  }));
  const concentrationData = series.concentrationBySegment.map((row, i) => ({
    name: row.name,
    value: row.value,
    color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
  }));
  const vintageData = series.vintage.map((row) => ({
    cohort: row.cohort,
    delinquencyPct: Math.round(row.delinquencyPct * 10) / 10,
  }));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-navy-900">
          Risk &amp; portfolio quality
        </h2>
        <Button
          variant="outline"
          size="sm"
          className="no-print"
          onClick={() =>
            downloadCsv("risk-aging-and-top10", [
              ...series.aging.map((r) => ({ section: "aging", label: r.label, outstanding: r.outstanding })),
              ...series.top10.map((r) => ({ section: "top10", label: r.name, outstanding: r.outstanding })),
            ])
          }
        >
          Export CSV
        </Button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {par30 ? (
          par30Href ? (
            <Link href={par30Href} className="block no-underline">
              <RiskKpiValue metric={par30} alertAboveThreshold={15} />
            </Link>
          ) : (
            <RiskKpiValue metric={par30} alertAboveThreshold={15} />
          )
        ) : null}
        {par90 ? <RiskKpiValue metric={par90} alertAboveThreshold={5} /> : null}
        {top10Concentration ? (
          <RiskKpiValue metric={top10Concentration} alertAboveThreshold={40} />
        ) : null}
        {rolloverCount ? <RiskKpiValue metric={rolloverCount} /> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-display text-base font-semibold text-navy-900">
            Aging buckets — outstanding balance
          </h3>
          <RankedBarMini data={agingData} yKey="label" valueKey="outstanding" height={160} />
        </Card>

        <Card>
          <h3 className="mb-3 font-display text-base font-semibold text-navy-900">
            Top 10 exposures
          </h3>
          {top10Data.length ? (
            <>
              <RankedBarMini
                data={top10Data}
                yKey="name"
                valueKey="outstanding"
                color={CHART.info}
                height={220}
              />
              <ul className="mt-3 space-y-1 text-xs">
                {series.top10.map((row) => (
                  <li key={row.masterlistId}>
                    <Link
                      href={`/ar/masterlist/${row.masterlistId}`}
                      className="text-teal-700 hover:underline"
                    >
                      {row.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-ink-400">No accounts yet.</p>
          )}
        </Card>

        <Card>
          <h3 className="mb-3 font-display text-base font-semibold text-navy-900">
            Concentration by segment
          </h3>
          {concentrationData.length ? (
            <DonutMini data={concentrationData} height={160} showLegend />
          ) : (
            <p className="text-sm text-ink-400">No accounts yet.</p>
          )}
        </Card>

        <Card>
          <h3 className="mb-3 font-display text-base font-semibold text-navy-900">
            Vintage — current delinquency by cohort
          </h3>
          <p className="mb-3 text-xs text-ink-400">
            Delinquency rate as of today for each release-month cohort — a
            single snapshot, not a trajectory over time.
          </p>
          {vintageData.length ? (
            <RankedBarMini
              data={vintageData}
              yKey="cohort"
              valueKey="delinquencyPct"
              color={CHART.warning}
              height={180}
            />
          ) : (
            <p className="text-sm text-ink-400">No release dates on record yet.</p>
          )}
        </Card>
      </div>

      {recoveryRate ? (
        <Card className="mt-6">
          <h3 className="mb-1 font-display text-base font-semibold text-navy-900">
            Remedial recovery
          </h3>
          <p className="mb-3 text-sm text-ink-400">
            {getMetric("risk.remedialRecoveryRate")?.description}
          </p>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <RiskKpiValue metric={recoveryRate} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
