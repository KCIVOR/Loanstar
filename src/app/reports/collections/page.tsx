"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { formatMoney } from "@/lib/ar/format";
import { downloadCsv } from "@/lib/reports/csv";
import type { CollectorCollectionRow } from "@/lib/reports/collections-register";
import type { MetricValue, Period } from "@/lib/reports/metrics/types";
import { parseReportSegment, SEGMENT_CHIPS, type ReportSegment } from "@/lib/reports/segments";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  KpiCard,
  PageHeader,
  Spinner,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { cn } from "@/components/ui/cn";

type CollectionsResponse = {
  period: Period;
  metrics: MetricValue[];
  collectors: CollectorCollectionRow[];
};

function metricValue(metrics: MetricValue[], id: string): number {
  return metrics.find((m) => m.id === id)?.value ?? 0;
}

function formatPct(value: number): string {
  return `${Math.round(value * 10) / 10}%`;
}

export default function ReportsCollectionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const segment = parseReportSegment(searchParams.get("segment"));

  const [data, setData] = useState<CollectionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setSegment = useCallback(
    (next: ReportSegment) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("segment", next);
      router.replace(`/reports/collections?${params.toString()}`);
    },
    [router, searchParams],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("segment", segment);
    void fetch(`/api/reports/collections?${params.toString()}`)
      .then(async (res) => {
        const body = (await res.json()) as CollectionsResponse & { error?: string };
        if (!res.ok) throw new Error(body.error ?? "Failed to load collections");
        if (!cancelled) {
          setData(body);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load collections");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, segment]);

  const collected = metricValue(data?.metrics ?? [], "money.collected");
  const efficiency = metricValue(data?.metrics ?? [], "money.collectionEfficiency");
  const penalty = metricValue(data?.metrics ?? [], "money.penaltyIncome");

  return (
    <div>
      <PageHeader
        title="Collections"
        description="Did we collect what was due this period?"
        actions={
          <div className="flex items-center gap-2">
            {from && to ? (
              <span className="mono text-xs text-ink-400">
                {from} → {to}
              </span>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              disabled={!data?.collectors.length}
              onClick={() => {
                if (!data) return;
                downloadCsv(
                  "reports-collections.csv",
                  data.collectors.map((row) => ({
                    collector: row.name,
                    collected: row.amountCollected,
                    submitted: row.dcrsSubmitted,
                    reconciled: row.dcrsReconciled,
                    rejectionRatePct: row.rejectionRatePct,
                  })),
                );
              }}
            >
              Export CSV
            </Button>
          </div>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap gap-1.5">
          {SEGMENT_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={cn("fchip", segment === chip.id && "is-on")}
              onClick={() => setSegment(chip.id)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </Card>

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="mb-4 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <KpiCard label="Collected" value={formatMoney(collected)} highlight />
        <KpiCard label="Collection efficiency" value={formatPct(efficiency)} />
        <KpiCard label="Penalty income" value={formatMoney(penalty)} />
      </div>

      {loading && !data ? (
        <Spinner />
      ) : !data?.collectors.length ? (
        <EmptyState title="No collectors" description="No period collections or DCRRs for this filter." />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Collector</Th>
                <Th num>Collected</Th>
                <Th num>Submitted</Th>
                <Th num>Reconciled</Th>
                <Th num>Rejection rate</Th>
              </tr>
            </thead>
            <tbody>
              {data.collectors.map((row) => (
                <tr key={row.collectorUserId}>
                  <Td>{row.name}</Td>
                  <Td num>{formatMoney(row.amountCollected)}</Td>
                  <Td num>{row.dcrsSubmitted}</Td>
                  <Td num>{row.dcrsReconciled}</Td>
                  <Td num>{formatPct(row.rejectionRatePct)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
