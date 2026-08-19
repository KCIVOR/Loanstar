"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { OriginationPanel } from "@/components/reports/OriginationPanel";
import { Alert, PageHeader, Spinner } from "@/components/ui";
import type { OriginationSeries, StuckFile } from "@/lib/reports/metrics/origination";
import type { MetricValue, Period } from "@/lib/reports/metrics/types";

type PipelineResponse = {
  period: Period;
  metrics: MetricValue[];
  series: OriginationSeries;
  stuckFiles: StuckFile[];
};

export default function ReportsPipelinePage() {
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const [data, setData] = useState<PipelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    void fetch(`/api/reports/pipeline?${params.toString()}`)
      .then(async (res) => {
        const body = (await res.json()) as PipelineResponse & { error?: string };
        if (!res.ok) throw new Error(body.error ?? "Failed to load pipeline");
        if (!cancelled) {
          setData(body);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load pipeline");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  return (
    <div>
      <PageHeader
        title="Pipeline"
        description="Origination funnel, stuck files, and turnaround."
        actions={
          from && to ? (
            <span className="mono text-xs text-ink-400">
              {from} → {to}
            </span>
          ) : null
        }
      />
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {loading && !data ? (
        <Spinner />
      ) : data ? (
        <OriginationPanel
          metrics={data.metrics}
          series={data.series}
          stuckFiles={data.stuckFiles}
        />
      ) : (
        <Alert>Pipeline unavailable.</Alert>
      )}
    </div>
  );
}
