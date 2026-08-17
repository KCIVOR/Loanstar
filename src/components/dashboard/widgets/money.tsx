"use client";

import type {
  ArWidgetData,
  CollectionWidgetData,
  ReleaseWidgetData,
  RemedialWidgetData,
} from "@/lib/dashboard/types";

import { BarMini, LineMini } from "../charts";
import { CHART } from "../charts/theme";
import { CardGrid, ChartCard, EmptyNote, KpiRow, StatCard } from "../WidgetTile";
import { days, peso } from "./format";

export function ReleaseWidget({ data }: { data: ReleaseWidgetData }) {
  return (
    <>
      <KpiRow>
        <StatCard label="Pending release" value={data.pendingQueue} tone="gold" />
        <StatCard label="Approval → release" value={days(data.avgApprovalToReleaseDays)} />
      </KpiRow>
      <CardGrid>
        <ChartCard title="Weekly releases" size="full">
          {data.weeklyReleases.some((p) => p.count > 0) ? (
            <BarMini
              data={data.weeklyReleases}
              xKey="label"
              bars={[{ key: "count", name: "Releases", color: CHART.gold }]}
            />
          ) : (
            <EmptyNote>No releases in the last 8 weeks.</EmptyNote>
          )}
        </ChartCard>
      </CardGrid>
    </>
  );
}

export function ArWidget({ data }: { data: ArWidgetData }) {
  return (
    <>
      <KpiRow>
        <StatCard label="Outstanding" value={peso(data.totalOutstanding)} tone="gold" />
        <StatCard label="Active accounts" value={data.activeAccounts} />
      </KpiRow>
      <CardGrid>
        <ChartCard title="Aging buckets">
          {data.aging.some((b) => b.count > 0) ? (
            <BarMini
              data={data.aging}
              xKey="bucket"
              bars={[{ key: "outstanding", name: "Outstanding", color: CHART.info }]}
              height={150}
            />
          ) : (
            <EmptyNote>No active accounts.</EmptyNote>
          )}
        </ChartCard>
        <ChartCard title="Outstanding trend" caption="*Approximated from releases minus postings.">
          {data.outstandingTrend.some((p) => p.outstanding > 0) ? (
            <LineMini
              data={data.outstandingTrend}
              xKey="label"
              lines={[{ key: "outstanding", name: "Outstanding*", color: CHART.gold }]}
              height={150}
            />
          ) : (
            <EmptyNote>No portfolio history.</EmptyNote>
          )}
        </ChartCard>
      </CardGrid>
    </>
  );
}

export function CollectionWidget({ data }: { data: CollectionWidgetData }) {
  return (
    <>
      <KpiRow>
        <StatCard label="Collected this week" value={peso(data.collectedThisWeek)} tone="gold" />
        <StatCard label="DCRR draft" value={data.dcr.draft} />
        <StatCard
          label="DCRR submitted"
          value={data.dcr.submitted}
          tone={data.dcr.submitted > 0 ? "danger" : "default"}
        />
        <StatCard label="DCRR reconciled" value={data.dcr.reconciled} tone="success" />
      </KpiRow>
      <CardGrid>
        <ChartCard title="Weekly collected vs due" size="full">
          {data.weekly.some((p) => p.collected > 0 || p.due > 0) ? (
            <BarMini
              data={data.weekly}
              xKey="label"
              bars={[{ key: "collected", name: "Collected", color: CHART.success }]}
              line={{ key: "due", name: "Due", color: CHART.warning }}
            />
          ) : (
            <EmptyNote>No payments or dues in the last 8 weeks.</EmptyNote>
          )}
        </ChartCard>
      </CardGrid>
    </>
  );
}

export function RemedialWidget({ data }: { data: RemedialWidgetData }) {
  return (
    <>
      <KpiRow>
        <StatCard label="Under remedial" value={peso(data.totalUnderRemedial)} tone="danger" />
        {data.byStatus.map((s) => (
          <StatCard key={s.status} label={s.status} value={s.count} />
        ))}
      </KpiRow>
      <CardGrid>
        <ChartCard title="Monthly turnovers" size="full">
          {data.monthlyTurnovers.some((p) => p.count > 0) ? (
            <LineMini
              data={data.monthlyTurnovers}
              xKey="label"
              lines={[{ key: "count", name: "Turnovers", color: CHART.danger }]}
            />
          ) : (
            <EmptyNote>No turnovers in the last 6 months.</EmptyNote>
          )}
        </ChartCard>
      </CardGrid>
    </>
  );
}
