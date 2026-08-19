import Link from "next/link";

import { DonutMini, RankedBarMini } from "@/components/dashboard/charts";
import { CATEGORY_COLORS, CHART } from "@/components/dashboard/charts/theme";
import { peso, pct } from "@/components/dashboard/widgets/format";
import { SegmentBadge } from "@/components/reports/SegmentBadge";
import { Badge, Button, Card, EmptyState, KpiCard, Table, Td, Th } from "@/components/ui";
import { downloadCsv } from "@/lib/reports/csv";
import { getMetric } from "@/lib/reports/metrics/registry";
import type { OriginationSeries, StuckFile } from "@/lib/reports/metrics/origination";
import type { MetricValue } from "@/lib/reports/metrics/types";
import { collateralLabel, segmentLabel } from "@/lib/reports/segments";

function formatByUnit(id: string, value: number): string {
  const def = getMetric(id);
  switch (def?.unit) {
    case "percent":
      return pct(Math.round(value * 10) / 10);
    case "php":
      return peso(value);
    case "days":
      return `${Math.round(value * 10) / 10}d`;
    case "months":
      return `${Math.round(value)} mo`;
    case "count":
    default:
      return String(Math.round(value));
  }
}

function metricById(metrics: MetricValue[], id: string): MetricValue | undefined {
  return metrics.find((m) => m.id === id);
}

function OriginationKpi({ id, metrics, alertAboveThreshold }: { id: string; metrics: MetricValue[]; alertAboveThreshold?: number }) {
  const metric = metricById(metrics, id);
  const def = getMetric(id);
  if (!metric || !def) return null;
  const alert = alertAboveThreshold !== undefined && metric.value > alertAboveThreshold;
  return <KpiCard label={def.label} value={formatByUnit(id, metric.value)} alert={alert} />;
}

export function OriginationKpis({ metrics }: { metrics: MetricValue[] }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3.5 lg:grid-cols-3">
      <OriginationKpi id="origination.conversionRate" metrics={metrics} />
      <OriginationKpi id="origination.approvalRate" metrics={metrics} />
      <OriginationKpi id="origination.avgTimeToDecision" metrics={metrics} />
      <OriginationKpi id="origination.slaBreaches" metrics={metrics} alertAboveThreshold={5} />
      <OriginationKpi id="origination.avgApprovedAmount" metrics={metrics} />
      <OriginationKpi id="origination.avgTerm" metrics={metrics} />
    </div>
  );
}

export function OriginationPanel({
  metrics,
  series,
  stuckFiles,
}: {
  metrics: MetricValue[];
  series: OriginationSeries;
  stuckFiles: StuckFile[];
}) {
  const funnelData = series.funnel.map((row) => ({ label: row.label, count: row.count }));
  const denialData = series.denialReasons.map((row) => ({ reason: row.reason, count: row.count }));
  const cancellationData = series.cancellationReasons.map((row) => ({ reason: row.reason, count: row.count }));
  const mixData = series.mixBySegment.map((row, i) => ({
    name: row.name,
    value: row.value,
    color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
  }));
  const collateralMixData = (series.mixByCollateral ?? []).map((row, i) => ({
    name: row.name,
    value: row.value,
    color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
  }));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-navy-900">
          Origination funnel &amp; speed
        </h2>
        <Button
          variant="outline"
          size="sm"
          className="no-print"
          onClick={() =>
            downloadCsv("origination-funnel-and-stuck-files", [
              ...series.funnel.map((r) => ({
                section: "funnel",
                stage: r.label,
                count: r.count,
                dropoffPct: r.dropoffPct,
              })),
              ...stuckFiles.map((f) => ({
                section: "stuckFiles",
                applicationNo: f.applicationNo,
                borrowerName: f.borrowerName,
                status: f.status,
                segment: segmentLabel(f.segment),
                collateral: collateralLabel(f.collateralType),
                daysInStatus: f.daysInStatus,
                targetDays: f.targetDays,
              })),
            ])
          }
        >
          Export CSV
        </Button>
      </div>

      <OriginationKpis metrics={metrics} />

      <Card className="mb-6">
        <h3 className="mb-3 font-display text-base font-semibold text-navy-900">
          Stuck files — over target for their current stage
        </h3>
        {stuckFiles.length === 0 ? (
          <EmptyState
            title="Nothing stuck"
            description="Every application in a tracked stage is within its target turnaround."
            showMark={false}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Application</Th>
                <Th>Borrower</Th>
                <Th>Segment</Th>
                <Th>Collateral</Th>
                <Th>Stage</Th>
                <Th num>Days in stage</Th>
                <Th num>Target</Th>
              </tr>
            </thead>
            <tbody>
              {stuckFiles.map((f) => (
                <tr key={f.applicationId}>
                  <Td className="mono">
                    <Link href={`/csa/applications/${f.applicationId}`} className="text-teal-700 hover:underline">
                      {f.applicationNo ?? f.applicationId.slice(0, 8)}
                    </Link>
                  </Td>
                  <Td>{f.borrowerName ?? "—"}</Td>
                  <Td>
                    <SegmentBadge segment={f.segment} />
                  </Td>
                  <Td>{collateralLabel(f.collateralType)}</Td>
                  <Td>{f.status.replaceAll("_", " ")}</Td>
                  <Td num className="mono text-danger">
                    {f.daysInStatus}d
                  </Td>
                  <Td num className="mono text-ink-400">
                    {f.targetDays}d
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <p className="mt-3 text-xs text-ink-400">Opening a file requires Intake access.</p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-display text-base font-semibold text-navy-900">
            Funnel
          </h3>
          <RankedBarMini data={funnelData} yKey="label" valueKey="count" height={260} />
          <ul className="mt-3 space-y-1 text-xs text-ink-400">
            {series.funnel.map((row) => (
              <li key={row.stage} className="flex justify-between">
                <span>{row.label}</span>
                <span className="mono">
                  {row.count}
                  {row.dropoffPct !== null ? ` (−${Math.round(row.dropoffPct * 10) / 10}%)` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h3 className="mb-3 font-display text-base font-semibold text-navy-900">
            Turnaround vs target
          </h3>
          <Table>
            <thead>
              <tr>
                <Th>Stage</Th>
                <Th num>Avg</Th>
                <Th num>Target</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {series.tatVsTarget.map((row) => (
                <tr key={row.label}>
                  <Td>{row.label}</Td>
                  <Td num className="mono">
                    {row.averageDays !== null ? `${row.averageDays}d` : "—"}
                  </Td>
                  <Td num className="mono text-ink-400">
                    {row.targetDays >= 9999 ? "—" : `${row.targetDays}d`}
                  </Td>
                  <Td>
                    {row.sampleCount === 0 ? (
                      <span className="text-ink-400">no data</span>
                    ) : row.breachCount > 0 ? (
                      <Badge variant="danger">{row.breachCount} over target</Badge>
                    ) : (
                      <Badge variant="success">on target</Badge>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card>
          <h3 className="mb-3 font-display text-base font-semibold text-navy-900">
            Denial reasons
          </h3>
          {denialData.length ? (
            <RankedBarMini data={denialData} yKey="reason" valueKey="count" color={CHART.danger} height={140} />
          ) : (
            <p className="text-sm text-ink-400">No denials on record.</p>
          )}
        </Card>

        <Card>
          <h3 className="mb-3 font-display text-base font-semibold text-navy-900">
            Cancellation reasons
          </h3>
          {cancellationData.length ? (
            <RankedBarMini data={cancellationData} yKey="reason" valueKey="count" color={CHART.warning} height={140} />
          ) : (
            <p className="text-sm text-ink-400">No cancellations on record.</p>
          )}
        </Card>

        <Card>
          <h3 className="mb-3 font-display text-base font-semibold text-navy-900">
            Mix by segment
          </h3>
          {mixData.length ? (
            <DonutMini data={mixData} height={160} showLegend />
          ) : (
            <p className="text-sm text-ink-400">No applications yet.</p>
          )}
        </Card>

        <Card>
          <h3 className="mb-3 font-display text-base font-semibold text-navy-900">
            Mix by collateral
          </h3>
          {collateralMixData.length ? (
            <DonutMini data={collateralMixData} height={160} showLegend />
          ) : (
            <p className="text-sm text-ink-400">No applications yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
