"use client";

import { useCallback, useEffect, useState } from "react";

import { Alert, Card, Spinner } from "@/components/admin/ui";
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
  return v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  if (loading) return <Spinner />;
  if (!data) return <Alert>Reports unavailable.</Alert>;

  const pipelineTotal = Object.values(data.pipeline).reduce((s, n) => s + n, 0);
  const overdue91 = data.aging.bucket91_plus;

  return (
    <div>
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {/* Hero KPI band — navy, matches the Deep Harbor "portfolio at a glance" pattern */}
      <div className="mb-6 rounded-lg bg-primary-900 px-7 py-6 text-white">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-[-0.5px]">Portfolio at a glance</h1>
          <p className="text-xs text-primary-300">
            Generated {new Date(data.generatedAt).toLocaleString()}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-0 lg:grid-cols-4">
          <div className="border-white/10 pr-6 lg:border-r">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-300">
              Pipeline applications
            </p>
            <p className="mt-2 text-[40px] font-extrabold leading-none tabular-nums">
              {pipelineTotal}
            </p>
          </div>
          <div className="pl-0 pr-6 lg:border-r lg:border-white/10 lg:pl-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-300">
              Active loans
            </p>
            <p className="mt-2 text-[40px] font-extrabold leading-none tabular-nums">
              {data.activeLoans}
            </p>
          </div>
          <div className="border-white/10 pr-6 pt-4 lg:border-r lg:pt-0 lg:pl-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-300">
              Portfolio outstanding
            </p>
            <p className="mt-2 text-[40px] font-extrabold leading-none tabular-nums">
              {money(data.aging.totalOutstanding)}
            </p>
          </div>
          <div className="pt-4 lg:pl-6 lg:pt-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-300">
              Posted collections
            </p>
            <p className="mt-2 text-[40px] font-extrabold leading-none tabular-nums text-gold">
              {money(data.income.totalPosted)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Pipeline by stage</h2>
          <ul className="space-y-1 text-sm">
            {Object.entries(data.pipeline)
              .sort((a, b) => b[1] - a[1])
              .map(([status, count]) => (
                <li key={status} className="flex justify-between">
                  <span>{formatStatusLabel(status)}</span>
                  <span className="font-medium">{count}</span>
                </li>
              ))}
          </ul>
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-semibold">Aging buckets</h2>
          <ul className="space-y-1 text-sm">
            <li className="flex justify-between"><span>Current</span><span>{data.aging.current}</span></li>
            <li className="flex justify-between"><span>1–30 days</span><span>{data.aging.bucket1_30}</span></li>
            <li className="flex justify-between"><span>31–60 days</span><span>{data.aging.bucket31_60}</span></li>
            <li className="flex justify-between"><span>61–90 days</span><span>{data.aging.bucket61_90}</span></li>
            <li className="flex justify-between">
              <span className="text-danger-600">91+ days</span>
              <span className="font-semibold text-danger-600">{overdue91}</span>
            </li>
          </ul>
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-semibold">Income recognition</h2>
          <ul className="space-y-1 text-sm">
            <li className="flex justify-between">
              <span>Posted payments</span>
              <span>{money(data.income.totalPosted)}</span>
            </li>
            <li className="flex justify-between">
              <span>Penalties collected</span>
              <span>{money(data.income.totalPenalties)}</span>
            </li>
            <li className="flex justify-between">
              <span>Posting count</span>
              <span>{data.income.paymentCount}</span>
            </li>
          </ul>
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-semibold">Collection performance</h2>
          <ul className="space-y-1 text-sm">
            <li className="flex justify-between">
              <span>DCRs awaiting AR</span>
              <span>{data.collection.dcrsSubmitted}</span>
            </li>
            <li className="flex justify-between">
              <span>DCRs reconciled</span>
              <span>{data.collection.dcrsReconciled}</span>
            </li>
            <li className="flex justify-between">
              <span>Pending proofs</span>
              <span>{data.collection.pendingProofs}</span>
            </li>
            <li className="flex justify-between">
              <span>Posted payments</span>
              <span>{data.collection.postedPayments}</span>
            </li>
          </ul>
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="mb-3 text-lg font-semibold">Turnaround time (TAT) by step</h2>
        <ul className="divide-y divide-neutral-100 text-sm">
          {data.tat.map((row) => (
            <li key={row.label} className="flex justify-between py-2">
              <span>{row.label}</span>
              <span>
                {row.averageDays != null
                  ? `${row.averageDays} days (n=${row.sampleCount})`
                  : "—"}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
