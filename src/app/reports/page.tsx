"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Alert, Badge, Card, KpiCard, PageHeader, Spinner } from "@/components/ui";
import { formatStatusLabel } from "@/lib/applications/status";

type Dashboard = {
  pipeline: Record<string, number>;
  aging: {
    current: number;
    bucket1_30: number;
    bucket31_60: number;
    bucket61_90: number;
    bucket91_plus: number;
    totalOutstanding: number;
  };
  income: {
    totalPosted: number;
    totalPenalties: number;
    paymentCount: number;
  };
  collection: {
    dcrsSubmitted: number;
    dcrsReconciled: number;
    pendingProofs: number;
    postedPayments: number;
  };
  activeLoans: number;
  tat: Array<{
    label: string;
    averageDays: number | null;
    sampleCount: number;
  }>;
  generatedAt: string;
};

function money(v: number) {
  return v.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function ReportsDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reports/dashboard");
      if (!res.ok) throw new Error("Failed to load reports");
      setData((await res.json()) as Dashboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pipelineTotal = useMemo(
    () => (data ? Object.values(data.pipeline).reduce((s, n) => s + n, 0) : 0),
    [data],
  );

  if (loading) return <Spinner />;
  if (!data) return <Alert>Reports unavailable.</Alert>;

  const overdue91 = data.aging.bucket91_plus;
  const maxAging = Math.max(
    data.aging.current,
    data.aging.bucket1_30,
    data.aging.bucket31_60,
    data.aging.bucket61_90,
    data.aging.bucket91_plus,
    1,
  );

  return (
    <div>
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <PageHeader
        title="Portfolio at a glance"
        actions={
          <p className="font-mono text-xs text-ink-faint">
            Generated {new Date(data.generatedAt).toLocaleString()}
          </p>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <KpiCard label="Pipeline applications" value={pipelineTotal} />
        <KpiCard label="Active loans" value={data.activeLoans} />
        <KpiCard
          label="Portfolio outstanding"
          value={money(data.aging.totalOutstanding)}
          highlight
        />
        <KpiCard
          label="Posted collections"
          value={money(data.income.totalPosted)}
          highlight
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-display text-lg font-semibold text-ink">
            Pipeline by stage
          </h2>
          <ul className="space-y-2 text-sm">
            {Object.entries(data.pipeline)
              .sort((a, b) => b[1] - a[1])
              .map(([status, count]) => (
                <li key={status} className="flex items-center justify-between">
                  <span className="text-ink-muted">{formatStatusLabel(status)}</span>
                  <span className="font-mono font-medium text-ink">{count}</span>
                </li>
              ))}
          </ul>
        </Card>

        <Card>
          <h2 className="mb-3 font-display text-lg font-semibold text-ink">
            Aging buckets
          </h2>
          <ul className="space-y-3 text-sm">
            {[
              { label: "Current", value: data.aging.current, tone: "success" as const },
              { label: "1–30 days", value: data.aging.bucket1_30, tone: "info" as const },
              { label: "31–60 days", value: data.aging.bucket31_60, tone: "warning" as const },
              { label: "61–90 days", value: data.aging.bucket61_90, tone: "warning" as const },
              { label: "91+ days", value: data.aging.bucket91_plus, tone: "danger" as const },
            ].map((row) => (
              <li key={row.label}>
                <div className="mb-1 flex justify-between">
                  <span className="text-ink-muted">{row.label}</span>
                  <span className="font-mono font-medium text-ink">{row.value}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className={`h-full rounded-full ${
                      row.tone === "success"
                        ? "bg-success"
                        : row.tone === "info"
                          ? "bg-info"
                          : row.tone === "warning"
                            ? "bg-warning"
                            : "bg-danger"
                    }`}
                    style={{ width: `${Math.max(4, (row.value / maxAging) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="mb-3 font-display text-lg font-semibold text-ink">
            Income recognition
          </h2>
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between">
              <span className="text-ink-muted">Posted payments</span>
              <span className="font-mono text-ink">{money(data.income.totalPosted)}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-ink-muted">Penalties collected</span>
              <span className="font-mono text-ink">{money(data.income.totalPenalties)}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-ink-muted">Posting count</span>
              <span className="font-mono text-ink">{data.income.paymentCount}</span>
            </li>
          </ul>
        </Card>

        <Card>
          <h2 className="mb-3 font-display text-lg font-semibold text-ink">
            Collection performance
          </h2>
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between">
              <span className="text-ink-muted">DCRs awaiting AR</span>
              <span className="font-mono text-ink">{data.collection.dcrsSubmitted}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-ink-muted">DCRs reconciled</span>
              <span className="font-mono text-ink">{data.collection.dcrsReconciled}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-ink-muted">Pending proofs</span>
              <span className="font-mono text-ink">{data.collection.pendingProofs}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-ink-muted">Posted payments</span>
              <span className="font-mono text-ink">{data.collection.postedPayments}</span>
            </li>
          </ul>
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="mb-3 font-display text-lg font-semibold text-ink">
          Turnaround time (TAT) by step
        </h2>
        <ul className="divide-y divide-neutral-100 text-sm">
          {data.tat.map((row) => (
            <li key={row.label} className="flex justify-between py-2.5">
              <span className="text-ink-muted">{row.label}</span>
              <span className="font-mono text-ink">
                {row.averageDays != null
                  ? `${row.averageDays} days (n=${row.sampleCount})`
                  : "—"}
              </span>
            </li>
          ))}
        </ul>
        {overdue91 > 0 ? (
          <div className="mt-4">
            <Badge variant="danger">{overdue91} accounts 91+ days overdue</Badge>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
