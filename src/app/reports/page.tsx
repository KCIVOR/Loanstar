"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  Card,
  PageHeader,
  Spinner,
} from "@/components/admin/ui";
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

  return (
    <div>
      <PageHeader
        title="Management reports"
        description={`Generated ${new Date(data.generatedAt).toLocaleString()}`}
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-zinc-500">Pipeline applications</p>
          <p className="text-2xl font-semibold">{pipelineTotal}</p>
        </Card>
        <Card>
          <p className="text-sm text-zinc-500">Active loans</p>
          <p className="text-2xl font-semibold">{data.activeLoans}</p>
        </Card>
        <Card>
          <p className="text-sm text-zinc-500">Portfolio outstanding</p>
          <p className="text-2xl font-semibold">{money(data.aging.totalOutstanding)}</p>
        </Card>
        <Card>
          <p className="text-sm text-zinc-500">Posted collections</p>
          <p className="text-2xl font-semibold">{money(data.income.totalPosted)}</p>
        </Card>
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
            <li className="flex justify-between"><span>91+ days</span><span>{data.aging.bucket91_plus}</span></li>
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
        <ul className="divide-y divide-zinc-100 text-sm">
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
