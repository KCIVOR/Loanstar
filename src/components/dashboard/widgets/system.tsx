"use client";

import type {
  AuditWidgetData,
  AuthAdminWidgetData,
  ReportsWidgetData,
} from "@/lib/dashboard/types";

import { HBarMini, LineMini } from "../charts";
import { CHART } from "../charts/theme";
import { CardGrid, ChartCard, EmptyNote, KpiRow, StatCard, TableCard } from "../WidgetTile";
import { peso } from "./format";

export function ReportsWidget({ data }: { data: ReportsWidgetData }) {
  const pipelineTotal = Object.values(data.pipeline).reduce((s, n) => s + n, 0);
  const collectionDenominator = data.aging.totalOutstanding + data.income.totalPosted;
  const collectionRate =
    collectionDenominator > 0
      ? Math.round((data.income.totalPosted / collectionDenominator) * 1000) / 10
      : null;

  const tatData = data.tat
    .filter((t) => t.averageDays != null)
    .map((t) => ({ label: t.label, days: t.averageDays }));

  return (
    <>
      <KpiRow>
        <StatCard label="Pipeline" value={pipelineTotal} />
        <StatCard label="Portfolio" value={peso(data.aging.totalOutstanding)} tone="gold" />
        <StatCard label="Active loans" value={data.activeLoans} />
        <StatCard
          label="Collection rate"
          value={collectionRate != null ? `${collectionRate}%` : "—"}
          tone="success"
        />
      </KpiRow>
      <CardGrid>
        <ChartCard title="Avg turnaround by stage" size="full">
          {tatData.length > 0 ? (
            <HBarMini
              data={tatData}
              yKey="label"
              bars={[{ key: "days", name: "Avg days", color: CHART.info }]}
            />
          ) : (
            <EmptyNote>Not enough history to compute turnaround times.</EmptyNote>
          )}
        </ChartCard>
      </CardGrid>
    </>
  );
}

export function AuthAdminWidget({ data }: { data: AuthAdminWidgetData }) {
  return (
    <>
      <KpiRow>
        <StatCard label="Users" value={data.totalUsers} />
        <StatCard label="Active" value={data.activeUsers} tone="success" />
        <StatCard
          label="Deactivated"
          value={data.inactiveUsers}
          tone={data.inactiveUsers > 0 ? "danger" : "default"}
        />
      </KpiRow>
      <CardGrid>
        <TableCard
          title="Users by role"
          columns={["Role", "Users"]}
          rows={data.byRole}
          emptyText="No role assignments."
          renderRow={(r) => (
            <tr key={r.role}>
              <td className="py-1.5 pr-3 font-semibold text-ink-900">{r.role}</td>
              <td className="py-1.5 text-ink-500">{r.count}</td>
            </tr>
          )}
        />
      </CardGrid>
    </>
  );
}

const TIME_LABEL = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function AuditWidget({ data }: { data: AuditWidgetData }) {
  return (
    <CardGrid>
      <ChartCard title="Events per day" size="full">
        {data.daily.some((p) => p.count > 0) ? (
          <LineMini
            data={data.daily}
            xKey="label"
            lines={[{ key: "count", name: "Events", color: CHART.navyMuted }]}
          />
        ) : (
          <EmptyNote>No audit events in the last 14 days.</EmptyNote>
        )}
      </ChartCard>
      <TableCard
        title="Recent events"
        columns={["Module", "Action", "Entity", "Time"]}
        rows={data.recent}
        emptyText="No recent events."
        renderRow={(e, i) => (
          <tr key={`${e.createdAt}-${i}`}>
            <td className="py-1.5 pr-3 font-semibold text-ink-900">{e.moduleSlug}</td>
            <td className="py-1.5 pr-3 text-ink-muted">{e.action}</td>
            <td className="py-1.5 pr-3 text-ink-muted">{e.entityType ?? "—"}</td>
            <td className="py-1.5 text-ink-400">{TIME_LABEL.format(new Date(e.createdAt))}</td>
          </tr>
        )}
      />
    </CardGrid>
  );
}
