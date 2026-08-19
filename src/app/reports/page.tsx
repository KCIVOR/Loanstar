"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Alert, Button, KpiCard, PageHeader, Spinner } from "@/components/ui";
import { AssistantDrawer } from "@/components/reports/AssistantDrawer";
import { setAssistantOpen, useAssistantWidth } from "@/components/reports/assistant/width";
import { MoneyPanel } from "@/components/reports/MoneyPanel";
import { OriginationKpis } from "@/components/reports/OriginationPanel";
import { RiskPanel } from "@/components/reports/RiskPanel";
import { StaffPanel } from "@/components/reports/StaffPanel";
import type { MoneySeries } from "@/lib/reports/metrics/money";
import type { OriginationSeries, StuckFile } from "@/lib/reports/metrics/origination";
import type { RiskSeries } from "@/lib/reports/metrics/risk";
import type { StaffSeries } from "@/lib/reports/metrics/staff";
import type { MetricValue, Period } from "@/lib/reports/metrics/types";
import { parsePeriod, presetPeriod } from "@/lib/reports/period";

type Dashboard = {
  period: Period;
  metrics: MetricValue[];
  series: {
    money: MoneySeries;
    risk: RiskSeries;
    origination: OriginationSeries;
    staff: StaffSeries;
  };
  stuckFiles: StuckFile[];
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
  const searchParams = useSearchParams();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { open: assistantOpen } = useAssistantWidth();

  const urlFrom = searchParams.get("from");
  const urlTo = searchParams.get("to");
  const activePeriod = useMemo<Period>(() => {
    if (urlFrom && urlTo) return parsePeriod(new URLSearchParams({ from: urlFrom, to: urlTo }));
    return presetPeriod("mtd");
  }, [urlFrom, urlTo]);

  const load = useCallback(async (period: Period) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: period.from, to: period.to });
      const res = await fetch(`/api/reports/dashboard?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load reports");
      setData((await res.json()) as Dashboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(activePeriod);
  }, [load, activePeriod]);

  useEffect(() => {
    return () => setAssistantOpen(false);
  }, []);

  const pipelineTotal = useMemo(
    () => (data ? Object.values(data.pipeline).reduce((s, n) => s + n, 0) : 0),
    [data],
  );

  if (loading && !data) return <Spinner />;
  if (!data) return <Alert>Reports unavailable.</Alert>;

  const collected = data.metrics.find((m) => m.id === "money.collected");
  const periodQuery = `from=${activePeriod.from}&to=${activePeriod.to}`;
  const accountsUnpaidHref = `/reports/accounts?view=loans&status=unpaid&${periodQuery}`;
  const collectionsHref = `/reports/collections?${periodQuery}`;
  const par30Href = `/reports/past-due?aging=par30&${periodQuery}`;

  return (
    <>
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <PageHeader
        title="Portfolio at a glance"
        actions={
          <div className="flex items-center gap-3">
            <p className="mono text-xs text-ink-400">
              Generated {new Date(data.generatedAt).toLocaleString()}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="no-print"
              onClick={() => window.print()}
            >
              Print / Export PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="no-print"
              aria-expanded={assistantOpen}
              aria-label={assistantOpen ? "Close LoanBot" : "Open LoanBot"}
              onClick={() => setAssistantOpen(!assistantOpen)}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                width={14}
                height={14}
                aria-hidden
                style={{ marginRight: 6 }}
              >
                <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M17.7 6.3l-2.5 2.5M8.8 15.2l-2.5 2.5" />
              </svg>
              LoanBot
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid min-w-0 grid-cols-2 gap-3.5 xl:grid-cols-4">
        <KpiCard className="min-w-0" label="Pipeline applications" value={pipelineTotal} />
        <Link href={accountsUnpaidHref} className="block min-w-0 no-underline">
          <KpiCard className="min-w-0" label="Active loans" value={data.activeLoans} />
        </Link>
        <Link href={accountsUnpaidHref} className="block min-w-0 no-underline">
          <KpiCard
            className="min-w-0"
            label="Portfolio outstanding"
            value={money(data.aging.totalOutstanding)}
            highlight
          />
        </Link>
        <Link href={collectionsHref} className="block min-w-0 no-underline">
          <KpiCard
            className="min-w-0"
            label="Posted collections"
            value={money(collected?.value ?? 0)}
            highlight
          />
        </Link>
      </div>

      <div className="mb-6">
        <MoneyPanel metrics={data.metrics} series={data.series.money} />
      </div>

      <div className="mb-6">
        <RiskPanel metrics={data.metrics} series={data.series.risk} par30Href={par30Href} />
      </div>

      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-navy-900">
            Origination
          </h2>
          <Link
            href={`/reports/pipeline?from=${activePeriod.from}&to=${activePeriod.to}`}
            className="text-sm font-medium text-teal-700 hover:underline"
          >
            Open pipeline
          </Link>
        </div>
        <OriginationKpis metrics={data.metrics} />
      </div>

      <div className="mb-6">
        <StaffPanel series={data.series.staff} />
      </div>
      <AssistantDrawer
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        period={activePeriod}
      />
    </>
  );
}
