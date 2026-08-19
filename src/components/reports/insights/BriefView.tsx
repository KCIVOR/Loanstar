"use client";

import { RankedBarMini } from "@/components/dashboard/charts";
import { CHART } from "@/components/dashboard/charts/theme";
import { days, peso, pct } from "@/components/dashboard/widgets/format";
import { Alert, Card, KpiCard, Table, Td, Th } from "@/components/ui";
import type { EvidenceBundle } from "@/lib/reports/insights/evidence";
import type { BriefSectionId, ExecutiveBrief } from "@/lib/reports/insights/schema";
import type { TrendGroup, TrendSeries } from "@/lib/reports/trends";

import { RecommendationList } from "./RecommendationList";
import { SectionCard } from "./SectionCard";
import { formatTrendValue, seriesByUnit, TrendChart } from "./TrendChart";

function group(evidence: EvidenceBundle, id: string): TrendGroup | undefined {
  return evidence.trends.groups.find((g) => g.id === id);
}

function seriesById(g: TrendGroup | undefined, id: string): TrendSeries | undefined {
  return g?.series.find((s) => s.id === id);
}

function latest(series: TrendSeries | undefined): number | null {
  for (let i = (series?.points.length ?? 0) - 1; i >= 0; i -= 1) {
    const value = series!.points[i]!.value;
    if (value !== null) return value;
  }
  return null;
}

/** Movement between the first and last month that actually hold a value. */
function movement(series: TrendSeries | undefined): { direction: "up" | "down"; text: string } | undefined {
  const values = (series?.points ?? []).filter((p) => p.value !== null);
  if (values.length < 2) return undefined;
  const first = values[0]!.value!;
  const last = values[values.length - 1]!.value!;
  if (first === last) return undefined;
  const delta = last - first;
  return {
    direction: delta >= 0 ? "up" : "down",
    text: `${formatTrendValue(Math.abs(Math.round(delta * 10) / 10), series!.unit)} since ${values[0]!.label}`,
  };
}

function TrendKpi({ series, label }: { series: TrendSeries | undefined; label?: string }) {
  if (!series) return null;
  return (
    <KpiCard
      label={label ?? series.label}
      value={formatTrendValue(latest(series), series.unit)}
      delta={movement(series)}
    />
  );
}

function PortfolioBody({ evidence }: { evidence: EvidenceBundle }) {
  const g = group(evidence, "portfolio");
  if (!g) return null;
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3.5 lg:grid-cols-3">
        <TrendKpi series={seriesById(g, "portfolio.outstanding")} />
        <TrendKpi series={seriesById(g, "portfolio.released")} />
        <TrendKpi series={seriesById(g, "portfolio.activeLoans")} />
      </div>
      <TrendChart series={seriesByUnit(g.series, "php")} coverage={g.coverage} />
    </>
  );
}

function CollectionsBody({ evidence }: { evidence: EvidenceBundle }) {
  const g = group(evidence, "collections");
  if (!g) return null;
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3.5 lg:grid-cols-3">
        <TrendKpi series={seriesById(g, "collections.collected")} />
        <TrendKpi series={seriesById(g, "collections.due")} />
        <TrendKpi series={seriesById(g, "collections.efficiency")} />
      </div>
      <TrendChart series={seriesByUnit(g.series, "php")} />
      <div className="mt-3">
        <TrendChart series={seriesByUnit(g.series, "percent")} coverage={g.coverage} height={140} />
      </div>
    </>
  );
}

function DelinquencyBody({ evidence }: { evidence: EvidenceBundle }) {
  const g = group(evidence, "delinquency");
  if (!g) return null;
  const a = evidence.aging;
  // buildAgingReport counts accounts per bucket; only totalOutstanding is money.
  const aging = [
    { bucket: "Current", accounts: a.current },
    { bucket: "1-30 days", accounts: a.bucket1_30 },
    { bucket: "31-60 days", accounts: a.bucket31_60 },
    { bucket: "61-90 days", accounts: a.bucket61_90 },
    { bucket: "Over 90 days", accounts: a.bucket91_plus },
  ];
  const totalAccounts = aging.reduce((sum, row) => sum + row.accounts, 0);
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3.5 lg:grid-cols-3">
        <TrendKpi series={seriesById(g, "delinquency.par30")} />
        <TrendKpi series={seriesById(g, "delinquency.par90")} />
        <TrendKpi series={seriesById(g, "delinquency.overdue")} />
      </div>
      <TrendChart series={seriesByUnit(g.series, "percent")} coverage={g.coverage} />
      {totalAccounts > 0 && (
        <div className="mt-4">
          <Table>
            <thead>
              <tr>
                <Th>Aging bucket</Th>
                <Th num>Accounts</Th>
                <Th num>Share</Th>
              </tr>
            </thead>
            <tbody>
              {aging.map((row) => (
                <tr key={row.bucket}>
                  <Td>{row.bucket}</Td>
                  <Td num>{row.accounts.toLocaleString("en-PH")}</Td>
                  <Td num>{pct(Math.round((row.accounts / totalAccounts) * 1000) / 10)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </>
  );
}

function ApprovalsBody({ evidence }: { evidence: EvidenceBundle }) {
  const g = group(evidence, "approvals");
  if (!g) return null;
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3.5 lg:grid-cols-3">
        <TrendKpi series={seriesById(g, "approvals.rate")} />
        <TrendKpi series={seriesById(g, "approvals.decisions")} />
        <TrendKpi series={seriesById(g, "approvals.approved")} />
      </div>
      <TrendChart series={seriesByUnit(g.series, "percent")} coverage={g.coverage} />
    </>
  );
}

function BottlenecksBody({ evidence }: { evidence: EvidenceBundle }) {
  const { entries, totalWaiting, breachedStages } = evidence.bottlenecks;
  if (entries.length === 0) {
    return <p className="text-sm text-[var(--ink-700)]">Nothing is waiting anywhere right now.</p>;
  }
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3.5 lg:grid-cols-3">
        <KpiCard label="Items waiting" value={totalWaiting.toLocaleString("en-PH")} />
        <KpiCard
          label="Stages past target"
          value={String(breachedStages)}
          alert={breachedStages > 0}
        />
        <KpiCard label="Worst queue" value={evidence.bottlenecks.worst?.stage ?? "—"} />
      </div>
      <div className="mb-4">
        <RankedBarMini
          data={entries.slice(0, 8).map((entry) => ({
            stage: entry.stage,
            waiting: entry.count,
            color: entry.breached ? CHART.danger : CHART.gold,
          }))}
          yKey="stage"
          valueKey="waiting"
        />
      </div>
      <Table>
        <thead>
          <tr>
            <Th>Stage</Th>
            <Th>Owner</Th>
            <Th num>Waiting</Th>
            <Th num>Oldest</Th>
            <Th num>Target</Th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <Td>{entry.stage}</Td>
              <Td>{entry.owner}</Td>
              <Td num>{entry.count}</Td>
              <Td num>
                <span className={entry.breached ? "text-[var(--danger)]" : undefined}>
                  {days(entry.oldestDays)}
                </span>
              </Td>
              <Td num>{days(entry.targetDays)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}

function StaffTable<T>({
  title,
  rows,
  columns,
}: {
  title: string;
  rows: T[];
  columns: Array<{ label: string; num?: boolean; render: (row: T) => string }>;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mb-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-400)]">
        {title}
      </p>
      <Table>
        <thead>
          <tr>
            {columns.map((col) => (
              <Th key={col.label} num={col.num}>
                {col.label}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((col) => (
                <Td key={col.label} num={col.num}>
                  {col.render(row)}
                </Td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

function StaffBody({ evidence }: { evidence: EvidenceBundle }) {
  const staff = evidence.staff;
  return (
    <>
      <StaffTable
        title="Collectors"
        rows={staff.collectorScorecard.slice(0, 8)}
        columns={[
          { label: "Name", render: (r) => r.name },
          { label: "Accounts", num: true, render: (r) => String(r.accountsHeld) },
          { label: "Collected", num: true, render: (r) => peso(r.amountCollected) },
          {
            label: "DCR rejected",
            num: true,
            render: (r) => pct(Math.round(r.rejectionRatePct * 10) / 10),
          },
        ]}
      />
      <StaffTable
        title="Agents"
        rows={staff.agentScorecard.slice(0, 8)}
        columns={[
          { label: "Name", render: (r) => r.name },
          { label: "Leads", num: true, render: (r) => String(r.leadsCreated) },
          { label: "Converted", num: true, render: (r) => String(r.leadsConverted) },
          { label: "Rate", num: true, render: (r) => pct(r.conversionRatePct) },
        ]}
      />
      <StaffTable
        title="Credit investigation"
        rows={staff.cigScorecard.slice(0, 8)}
        columns={[
          { label: "Name", render: (r) => r.name },
          { label: "Completed", num: true, render: (r) => String(r.verificationsCompleted) },
          { label: "Avg days", num: true, render: (r) => days(r.avgDaysToComplete) },
          { label: "Checks passed", num: true, render: (r) => pct(r.checkPassRatePct) },
        ]}
      />
      <StaffTable
        title="Release officers"
        rows={staff.lraScorecard.slice(0, 8)}
        columns={[
          { label: "Name", render: (r) => r.name },
          { label: "Assigned", num: true, render: (r) => String(r.filesAssigned) },
          { label: "Released", num: true, render: (r) => String(r.filesReleased) },
          { label: "Avg days", num: true, render: (r) => days(r.avgDaysToRelease) },
        ]}
      />
      <StaffTable
        title="Remedial"
        rows={staff.remedialScorecard.slice(0, 8)}
        columns={[
          { label: "Name", render: (r) => r.name },
          { label: "Accounts", num: true, render: (r) => String(r.accountsHeld) },
          { label: "Recovered", num: true, render: (r) => peso(r.amountRecovered) },
        ]}
      />
      <StaffTable
        title="Committee"
        rows={staff.committeeParticipation.slice(0, 8)}
        columns={[
          { label: "Name", render: (r) => r.name },
          { label: "Votes", num: true, render: (r) => String(r.votesCast) },
          { label: "Avg turnaround", num: true, render: (r) => days(r.avgTurnaroundDays) },
        ]}
      />
    </>
  );
}

const SECTION_BODY: Record<
  BriefSectionId,
  (props: { evidence: EvidenceBundle }) => React.ReactNode
> = {
  portfolio: PortfolioBody,
  collections: CollectionsBody,
  delinquency: DelinquencyBody,
  approvals: ApprovalsBody,
  bottlenecks: BottlenecksBody,
  staff: StaffBody,
};

export function BriefView({
  brief,
  evidence,
  createdAt,
}: {
  brief: ExecutiveBrief;
  evidence: EvidenceBundle;
  createdAt: string;
}) {
  return (
    <div className="space-y-5">
      {brief.headline && (
        <Card variant="gradient">
          <p className="text-lg font-semibold leading-snug text-white">
            {brief.headline}
          </p>
          <p className="mt-2 text-xs text-navy-200">
            {evidence.period.from} to {evidence.period.to} · prepared{" "}
            {new Date(createdAt).toLocaleString("en-PH")}
          </p>
        </Card>
      )}

      {brief.dataNotes.length > 0 && (
        <Alert variant="info" title="What this brief cannot tell you">
          <ul className="list-disc space-y-1 pl-5">
            {brief.dataNotes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </Alert>
      )}

      {brief.sections.map((section) => {
        const Body = SECTION_BODY[section.id];
        return (
          <SectionCard key={section.id} section={section}>
            <Body evidence={evidence} />
          </SectionCard>
        );
      })}

      <div>
        <h3 className="mb-3 text-base font-semibold text-[var(--ink-900)]">
          What to do next
        </h3>
        <RecommendationList recommendations={brief.recommendations} />
      </div>
    </div>
  );
}
