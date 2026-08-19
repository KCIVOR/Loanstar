"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { BriefView } from "@/components/reports/insights/BriefView";
import { Alert, Button, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { downloadCsv } from "@/lib/reports/csv";
import type { EvidenceBundle } from "@/lib/reports/insights/evidence";
import type { ExecutiveBrief } from "@/lib/reports/insights/schema";
import type { Period } from "@/lib/reports/metrics/types";
import { presetPeriod } from "@/lib/reports/period";

type BriefPayload = {
  id: string;
  period: { from: string; to: string };
  months: number;
  model: string;
  brief: ExecutiveBrief;
  evidence: EvidenceBundle;
  createdAt: string;
};

type LoadedBrief = {
  key: string;
  payload: BriefPayload | null;
  error: string | null;
};

function errorFrom(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body) {
    const message = (body as { error?: unknown }).error;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

/** One row per trend point across every series, so the CEO can hand the
 *  underlying figures to someone who wants a spreadsheet. */
function trendRows(evidence: EvidenceBundle) {
  const rows: Array<Record<string, unknown>> = [];
  for (const group of evidence.trends.groups) {
    for (const series of group.series) {
      for (const point of series.points) {
        rows.push({
          group: group.label,
          series: series.label,
          unit: series.unit,
          month: point.month,
          value: point.value ?? "",
        });
      }
    }
  }
  return rows;
}

export default function ReportsInsightsPage() {
  const searchParams = useSearchParams();
  const urlFrom = searchParams.get("from");
  const urlTo = searchParams.get("to");
  const period = useMemo<Period>(
    () => (urlFrom && urlTo ? { from: urlFrom, to: urlTo } : presetPeriod("mtd")),
    [urlFrom, urlTo],
  );

  const periodKey = `${period.from}:${period.to}`;
  /** Held together with the period it belongs to, so switching the date range
   *  shows a spinner instead of the previous range's brief. */
  const [loaded, setLoaded] = useState<LoadedBrief | null>(null);
  const [generating, setGenerating] = useState(false);

  const current = loaded?.key === periodKey ? loaded : null;
  const loading = current === null;
  const payload = current?.payload ?? null;
  const error = current?.error ?? null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/reports/insights?from=${period.from}&to=${period.to}`);
        const body = (await res.json()) as { latest?: BriefPayload | null };
        if (!res.ok) throw new Error(errorFrom(body, "Could not load briefs."));
        if (!cancelled) setLoaded({ key: periodKey, payload: body.latest ?? null, error: null });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Could not load briefs.";
        setLoaded({ key: periodKey, payload: null, error: message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [periodKey, period.from, period.to]);

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/reports/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period }),
      });
      const body = (await res.json()) as BriefPayload;
      if (!res.ok) throw new Error(errorFrom(body, "Could not generate the brief."));
      setLoaded({ key: periodKey, payload: body, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not generate the brief.";
      setLoaded((prev) => ({ key: periodKey, payload: prev?.payload ?? null, error: message }));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Executive Insights"
        description={`Portfolio, collections, risk, approvals, bottlenecks and staff for ${period.from} to ${period.to}.`}
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            {payload && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadCsv("executive-insights-trends.csv", trendRows(payload.evidence))}
                >
                  Export CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => window.print()}>
                  Print / Export PDF
                </Button>
              </>
            )}
            <Button size="sm" onClick={generate} loading={generating} disabled={generating}>
              {payload ? "Regenerate" : "Generate brief"}
            </Button>
          </div>
        }
      />

      {error && (
        <Alert variant="error" title="Could not build the brief">
          {error}
        </Alert>
      )}

      {generating && (
        <div className="py-10">
          <Spinner
            size="lg"
            label="Reading the last few months, then writing it up. This takes about half a minute."
          />
        </div>
      )}

      {!generating && loading && (
        <div className="py-10">
          <Spinner label="Loading the last brief" />
        </div>
      )}

      {!generating && !loading && !payload && !error && (
        <EmptyState
          title="No brief for this period yet"
          description="Generate one to see how the portfolio, collections, risk, approvals and each team are tracking, with the actions worth taking."
          action={<Button onClick={generate}>Generate brief</Button>}
        />
      )}

      {!generating && payload && (
        <BriefView
          brief={payload.brief}
          evidence={payload.evidence}
          createdAt={payload.createdAt}
        />
      )}
    </div>
  );
}
