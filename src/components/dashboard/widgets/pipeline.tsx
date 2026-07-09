"use client";

import type {
  CommitteeWidgetData,
  ComputationWidgetData,
  IntakeWidgetData,
  LeadsWidgetData,
  NegotiationWidgetData,
  VerificationWidgetData,
} from "@/lib/dashboard/types";

import { BarMini, DonutMini, HBarMini, LineMini } from "../charts";
import { CHART } from "../charts/theme";
import { CardGrid, ChartCard, EmptyNote, KpiRow, StatCard, TableCard } from "../WidgetTile";
import { days, pct, peso } from "./format";

const STATUS_LABELS: Record<string, string> = {
  registered: "Registered",
  documents_pending: "Docs pending",
  submitted: "Submitted",
  for_verification: "For CIG",
  for_approval: "For approval",
  approved: "Approved",
  denied: "Denied",
  negotiating_terms: "Negotiating",
  awaiting_confirmation: "Confirming",
  on_hold: "On hold",
  for_revision: "For revision",
  lra_pending: "LRA queue",
  release_signing: "Signing",
  release_briefing: "Briefing",
  release_ready: "Release ready",
  released: "Released",
  closed: "Closed",
  loan_active: "Active loan",
};

export function IntakeWidget({ data }: { data: IntakeWidgetData }) {
  const inFlight = data.statusCounts.filter(
    (s) => !["released", "closed", "loan_active", "denied"].includes(s.status),
  );
  const chartData = inFlight
    .map((s) => ({ status: STATUS_LABELS[s.status] ?? s.status, count: s.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return (
    <>
      <KpiRow>
        <StatCard label="New this week" value={data.newThisWeek} tone="gold" />
      </KpiRow>
      <CardGrid>
        <ChartCard title="8-week intake volume">
          {data.weekly.some((p) => p.count > 0) ? (
            <LineMini
              data={data.weekly}
              xKey="label"
              lines={[{ key: "count", name: "Applications", color: CHART.gold }]}
            />
          ) : (
            <EmptyNote>No applications in the last 8 weeks.</EmptyNote>
          )}
        </ChartCard>
        <ChartCard title="In flight by status">
          {chartData.length > 0 ? (
            <HBarMini
              data={chartData}
              yKey="status"
              bars={[{ key: "count", name: "Applications", color: CHART.gold }]}
            />
          ) : (
            <EmptyNote>No applications in flight.</EmptyNote>
          )}
        </ChartCard>
      </CardGrid>
    </>
  );
}

export function ComputationWidget({ data }: { data: ComputationWidgetData }) {
  return (
    <>
      <KpiRow>
        <StatCard
          label="Avg net released"
          value={data.avgComputed != null ? peso(data.avgComputed) : "—"}
          tone="gold"
        />
        <StatCard label="Computations (90d)" value={data.totalComputations} />
      </KpiRow>
      <CardGrid>
        <ChartCard title="Requested vs net released by loan type" size="full">
          {data.byLoanType.length > 0 ? (
            <BarMini
              data={data.byLoanType}
              xKey="loanType"
              bars={[
                { key: "requested", name: "Requested", color: CHART.navyMuted },
                { key: "computed", name: "Net released", color: CHART.gold },
              ]}
            />
          ) : (
            <EmptyNote>No computations in the last 90 days.</EmptyNote>
          )}
        </ChartCard>
      </CardGrid>
    </>
  );
}

export function VerificationWidget({ data }: { data: VerificationWidgetData }) {
  return (
    <>
      <KpiRow>
        <StatCard label="Pending queue" value={data.pendingVerifications} tone="gold" />
        <StatCard label="Avg TAT" value={days(data.avgTatDays)} />
      </KpiRow>
      <CardGrid>
        <ChartCard title="Checks by type" size="full">
          {data.checks.length > 0 ? (
            <HBarMini
              data={data.checks}
              yKey="checkType"
              bars={[
                { key: "pass", name: "Pass", color: CHART.success },
                { key: "fail", name: "Fail", color: CHART.danger },
                { key: "pending", name: "Pending", color: CHART.navyMuted },
              ]}
            />
          ) : (
            <EmptyNote>No CIG checks recorded yet.</EmptyNote>
          )}
        </ChartCard>
      </CardGrid>
    </>
  );
}

export function CommitteeWidget({ data }: { data: CommitteeWidgetData }) {
  const donut = [
    { name: "Approved", value: data.decisionsThisMonth.find((d) => d.action === "approve")?.count ?? 0, color: CHART.success },
    { name: "Denied", value: data.decisionsThisMonth.find((d) => d.action === "deny")?.count ?? 0, color: CHART.danger },
    { name: "Revisit", value: data.decisionsThisMonth.find((d) => d.action === "revisit")?.count ?? 0, color: CHART.warning },
    { name: "On hold", value: data.decisionsThisMonth.find((d) => d.action === "hold")?.count ?? 0, color: CHART.navyMuted },
  ];
  const hasDecisions = donut.some((d) => d.value > 0);
  const hasTrend = data.approvalTrend.some((p) => p.decisions > 0);

  return (
    <>
      <KpiRow>
        <StatCard label="Awaiting decision" value={data.pendingApplications} tone="gold" />
      </KpiRow>
      <CardGrid>
        <ChartCard title="Decisions this month">
          {hasDecisions ? (
            <DonutMini data={donut} height={160} />
          ) : (
            <EmptyNote>No decisions this month.</EmptyNote>
          )}
        </ChartCard>
        <ChartCard title="Approval rate trend">
          {hasTrend ? (
            <LineMini
              data={data.approvalTrend}
              xKey="label"
              lines={[{ key: "approvalRate", name: "Approval %", color: CHART.gold }]}
              height={160}
            />
          ) : (
            <EmptyNote>No decision history.</EmptyNote>
          )}
        </ChartCard>
      </CardGrid>
    </>
  );
}

export function NegotiationWidget({ data }: { data: NegotiationWidgetData }) {
  return (
    <KpiRow>
      <StatCard label="Active" value={data.active} tone="gold" />
      <StatCard label="Awaiting signature" value={data.awaitingSignature} />
      <StatCard label="Signed" value={data.signed} tone="success" />
      <StatCard label="Acceptance rate" value={pct(data.acceptanceRate)} />
    </KpiRow>
  );
}

const RECENT_LEAD_DATE = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
});

export function LeadsWidget({ data }: { data: LeadsWidgetData }) {
  const funnelData = data.funnel
    .map((f) => ({ status: STATUS_LABELS[f.status] ?? f.status, count: f.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return (
    <>
      <KpiRow>
        <StatCard label="Total leads" value={data.totalLeads} />
        <StatCard label="Converted" value={data.converted} tone="success" />
        <StatCard label="Conversion" value={pct(data.conversionRate)} tone="gold" />
      </KpiRow>
      <CardGrid>
        <ChartCard title="8-week lead volume">
          {data.weekly.some((p) => p.count > 0) ? (
            <LineMini
              data={data.weekly}
              xKey="label"
              lines={[{ key: "count", name: "Leads", color: CHART.gold }]}
            />
          ) : (
            <EmptyNote>No leads in the last 8 weeks.</EmptyNote>
          )}
        </ChartCard>
        <ChartCard title="Referred applications by stage">
          {funnelData.length > 0 ? (
            <HBarMini
              data={funnelData}
              yKey="status"
              bars={[{ key: "count", name: "Applications", color: CHART.navyMuted }]}
            />
          ) : (
            <EmptyNote>No converted leads yet.</EmptyNote>
          )}
        </ChartCard>
        <TableCard
          title="Recent leads"
          columns={["Borrower", "Status", "Date"]}
          rows={data.recentLeads}
          emptyText="No leads yet."
          renderRow={(lead) => (
            <tr key={lead.id}>
              <td className="py-1.5 pr-3 font-semibold text-ink">{lead.borrowerName}</td>
              <td className="py-1.5 pr-3">
                {lead.converted ? (
                  <span className="text-success-ink">Converted</span>
                ) : (
                  <span className="text-ink-muted">Open</span>
                )}
              </td>
              <td className="py-1.5 text-ink-faint">
                {RECENT_LEAD_DATE.format(new Date(lead.createdAt))}
              </td>
            </tr>
          )}
        />
      </CardGrid>
    </>
  );
}
