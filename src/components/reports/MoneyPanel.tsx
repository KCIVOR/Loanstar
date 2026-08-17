import { LineMini, HBarMini } from "@/components/dashboard/charts";
import { CHART } from "@/components/dashboard/charts/theme";
import { days, peso, pct } from "@/components/dashboard/widgets/format";
import { Button, Card, KpiCard } from "@/components/ui";
import { downloadCsv } from "@/lib/reports/csv";
import { getMetric } from "@/lib/reports/metrics/registry";
import type { MoneySeries } from "@/lib/reports/metrics/money";
import type { MetricDirection, MetricValue } from "@/lib/reports/metrics/types";

function formatByUnit(id: string, value: number): string {
  const def = getMetric(id);
  switch (def?.unit) {
    case "percent":
      return pct(Math.round(value * 10) / 10);
    case "days":
      return days(Math.round(value * 10) / 10);
    case "php":
    default:
      return peso(value);
  }
}

/** True when this specific move is a bad sign per the metric's own direction —
 * distinct from the arrow, which always reflects the raw value's real sign. */
function isBadMove(direction: MetricDirection, deltaAbs: number): boolean {
  if (direction === "up_good") return deltaAbs < 0;
  if (direction === "down_good") return deltaAbs > 0;
  return false;
}

function metricDelta(m: MetricValue): { direction: "up" | "down"; text: string } | undefined {
  if (m.deltaPct === null || m.deltaAbs === null) return undefined;
  return {
    direction: m.deltaAbs >= 0 ? "up" : "down",
    text: `${Math.abs(Math.round(m.deltaPct * 10) / 10)}% vs last period`,
  };
}

function MoneyKpi({ metric, highlight }: { metric: MetricValue; highlight?: boolean }) {
  const def = getMetric(metric.id);
  if (!def) return null;
  const alert =
    metric.deltaAbs !== null && isBadMove(def.direction, metric.deltaAbs);
  return (
    <KpiCard
      label={def.label}
      value={formatByUnit(metric.id, metric.value)}
      highlight={highlight && !alert}
      alert={alert}
      delta={metricDelta(metric)}
    />
  );
}

function metricById(metrics: MetricValue[], id: string): MetricValue | undefined {
  return metrics.find((m) => m.id === id);
}

export function MoneyPanel({
  metrics,
  series,
}: {
  metrics: MetricValue[];
  series: MoneySeries;
}) {
  const released = metricById(metrics, "money.released");
  const receivable = metricById(metrics, "money.receivable");
  const collected = metricById(metrics, "money.collected");
  const outstanding = metricById(metrics, "money.outstanding");
  const efficiency = metricById(metrics, "money.collectionEfficiency");
  const penaltyIncome = metricById(metrics, "money.penaltyIncome");
  const avgDaysToCollect = metricById(metrics, "money.avgDaysToCollect");
  const projected30 = metricById(metrics, "money.projected30");
  const projected60 = metricById(metrics, "money.projected60");
  const projected90 = metricById(metrics, "money.projected90");

  const collectedVsOutstanding = series.collectedVsOutstanding.length
    ? series.collectedVsOutstanding
    : [{ name: "Book", collected: 0, outstanding: 0 }];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-navy-900">
          Money &amp; collections
        </h2>
        <Button
          variant="outline"
          size="sm"
          className="no-print"
          onClick={() => downloadCsv("money-cash-in-trend", series.cashInTrend)}
        >
          Export CSV
        </Button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {released ? <MoneyKpi metric={released} /> : null}
        {receivable ? <MoneyKpi metric={receivable} /> : null}
        {collected ? <MoneyKpi metric={collected} highlight /> : null}
        {outstanding ? <MoneyKpi metric={outstanding} highlight /> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-display text-base font-semibold text-navy-900">
            Cash-in trend
          </h3>
          {series.cashInTrend.length ? (
            <LineMini
              data={series.cashInTrend}
              xKey="month"
              lines={[{ key: "collected", name: "Collected", color: CHART.gold }]}
            />
          ) : (
            <p className="text-sm text-ink-400">No posted collections yet.</p>
          )}
        </Card>

        <Card>
          <h3 className="mb-3 font-display text-base font-semibold text-navy-900">
            Collected vs outstanding
          </h3>
          <HBarMini
            data={collectedVsOutstanding}
            yKey="name"
            bars={[
              { key: "collected", name: "Collected", color: CHART.gold },
              { key: "outstanding", name: "Outstanding", color: CHART.info },
            ]}
            showLegend
            height={90}
          />
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {efficiency ? <MoneyKpi metric={efficiency} /> : null}
        {penaltyIncome ? <MoneyKpi metric={penaltyIncome} /> : null}
        {avgDaysToCollect ? <MoneyKpi metric={avgDaysToCollect} /> : null}
      </div>

      <Card className="mt-6">
        <h3 className="mb-3 font-display text-base font-semibold text-navy-900">
          Projected inflow
        </h3>
        <p className="mb-3 text-sm text-ink-400">
          Amount due on unpaid installments falling due from today.
        </p>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          {projected30 ? <MoneyKpi metric={projected30} /> : null}
          {projected60 ? <MoneyKpi metric={projected60} /> : null}
          {projected90 ? <MoneyKpi metric={projected90} /> : null}
        </div>
      </Card>
    </div>
  );
}
