"use client";

import { SparkMini } from "@/components/dashboard/charts";
import { CHART } from "@/components/dashboard/charts/theme";
import { days, peso, pct } from "@/components/dashboard/widgets/format";
import type {
  AnswerCard,
  EvidenceMetric,
  EvidenceTable,
  EvidenceTrend,
  TurnEvidence,
} from "@/lib/reports/assistant/card";
import type { MetricUnit } from "@/lib/reports/metrics/types";

/** The panel is 360px with 20px padding each side, so nothing may assume more
 *  than ~320px. Two KPIs per row is the practical ceiling. */
function formatValue(value: number | null, unit: MetricUnit | undefined): string {
  if (value === null) return "—";
  if (unit === "php") return peso(value);
  if (unit === "percent") return pct(value);
  if (unit === "days") return days(value);
  if (unit === "months") return `${value}mo`;
  return value.toLocaleString("en-PH");
}

/** Green when the move is the good direction for that metric, not when it is up. */
function deltaTone(metric: EvidenceMetric): string {
  if (metric.deltaPct === null || metric.deltaPct === 0) return "var(--ink-400)";
  const rising = metric.deltaPct > 0;
  if (metric.direction === "up_good") return rising ? "var(--accent)" : "var(--danger)";
  if (metric.direction === "down_good") return rising ? "var(--danger)" : "var(--accent)";
  return "var(--ink-400)";
}

function deltaLabel(metric: EvidenceMetric): string | null {
  if (metric.deltaPct === null) return null;
  const rounded = Math.round(metric.deltaPct * 10) / 10;
  if (rounded === 0) return "flat";
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function KpiRow({ metrics }: { metrics: EvidenceMetric[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
      {metrics.map((metric) => {
        const delta = deltaLabel(metric);
        return (
          <div
            key={metric.id}
            style={{
              padding: "8px 10px",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--line-soft)",
              background: "var(--surface)",
              minWidth: 0,
            }}
          >
            <div
              className="truncate text-[10px] uppercase tracking-wide text-ink-400"
              title={metric.label}
            >
              {metric.label}
            </div>
            <div className="font-display text-sm font-semibold text-navy-900">
              {formatValue(metric.value, metric.unit)}
            </div>
            {delta && (
              <div className="text-[10px]" style={{ color: deltaTone(metric) }}>
                {delta} vs prior
              </div>
            )}
            {metric.note && (
              <div className="mt-1 text-[10px] leading-snug text-ink-400">{metric.note}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TrendBlock({ trend }: { trend: EvidenceTrend }) {
  const data = trend.points.map((point) => ({ label: point.label, value: point.value }));
  const withValue = trend.points.filter((point) => point.value !== null);
  const first = withValue[0]?.value ?? null;
  const last = withValue[withValue.length - 1]?.value ?? null;

  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: "var(--r-md)",
        border: "1px solid var(--line-soft)",
        background: "var(--surface)",
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[10px] uppercase tracking-wide text-ink-400">
          {trend.label}
        </span>
        <span className="font-display text-xs font-semibold text-navy-900">
          {formatValue(last, trend.unit)}
        </span>
      </div>
      <SparkMini data={data} dataKey="value" height={40} color={CHART.gold} />
      <div className="flex justify-between text-[10px] text-ink-400">
        <span>
          {trend.points[0]?.label} · {formatValue(first, trend.unit)}
        </span>
        <span>{trend.points[trend.points.length - 1]?.label}</span>
      </div>
      {trend.coverageNote && (
        <div className="mt-1 text-[10px] leading-snug text-ink-400">{trend.coverageNote}</div>
      )}
    </div>
  );
}

function TableBlock({ table, limit }: { table: EvidenceTable; limit: number }) {
  const rows = table.rows.slice(0, limit);
  const hidden = table.total - rows.length;

  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wide text-ink-400">
        {table.label}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <thead>
          <tr>
            {table.columns.map((column) => (
              <th
                key={column.key}
                className="text-[10px] font-medium text-ink-400"
                style={{
                  textAlign: column.align,
                  padding: "2px 4px",
                  borderBottom: "1px solid var(--line-soft)",
                }}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {table.columns.map((column) => {
                const value = row[column.key];
                const display =
                  typeof value === "number"
                    ? formatValue(value, column.unit)
                    : (value ?? "—");
                return (
                  <td
                    key={column.key}
                    className="truncate text-[11px] text-ink-900"
                    style={{
                      textAlign: column.align,
                      padding: "3px 4px",
                      borderBottom: "1px solid var(--line-soft)",
                    }}
                    title={String(display)}
                  >
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {hidden > 0 && (
        <div className="mt-1 text-[10px] text-ink-400">
          {hidden.toLocaleString("en-PH")} more not shown
        </div>
      )}
    </div>
  );
}

export function AnswerCardView({
  card,
  evidence,
}: {
  card: AnswerCard;
  evidence: TurnEvidence;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="font-display text-[13px] font-semibold leading-snug text-navy-900">
        {card.headline}
      </div>

      {card.blocks.map((block, index) => {
        if (block.kind === "kpi") {
          const metrics = block.metricIds
            .map((id) => evidence.metrics[id])
            .filter((metric): metric is EvidenceMetric => Boolean(metric));
          if (metrics.length === 0) return null;
          return <KpiRow key={index} metrics={metrics} />;
        }

        if (block.kind === "chart") {
          const trend = evidence.trends[block.trendId];
          return trend ? <TrendBlock key={index} trend={trend} /> : null;
        }

        if (block.kind === "table") {
          const table = evidence.tables[block.tableId];
          return table ? (
            <TableBlock key={index} table={table} limit={block.limit} />
          ) : null;
        }

        if (block.kind === "bullets") {
          return (
            <ul key={index} style={{ margin: 0, paddingLeft: 16 }}>
              {block.items.map((item, i) => (
                <li key={i} className="text-xs leading-snug" style={{ marginBottom: 3 }}>
                  {item}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <div key={index} className="text-[11px] leading-snug text-ink-400">
            {block.text}
          </div>
        );
      })}

      {card.bottomLine && (
        <div
          className="text-xs leading-snug text-ink-900"
          style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 8 }}
        >
          {card.bottomLine}
        </div>
      )}
    </div>
  );
}
