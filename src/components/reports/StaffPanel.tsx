import { RankedBarMini } from "@/components/dashboard/charts";
import { CHART } from "@/components/dashboard/charts/theme";
import { peso } from "@/components/dashboard/widgets/format";
import { Badge, Button, Card, EmptyState, Table, Td, Th } from "@/components/ui";
import { downloadCsv } from "@/lib/reports/csv";
import type { StaffSeries } from "@/lib/reports/metrics/staff";

export function StaffPanel({ series }: { series: StaffSeries }) {
  const backlogData = series.proofBacklog.map((row) => ({ label: row.label, count: row.count }));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-navy-900">
          Staff productivity
        </h2>
        <Button
          variant="outline"
          size="sm"
          className="no-print"
          onClick={() =>
            downloadCsv("staff-collector-scorecard", series.collectorScorecard.map((r) => ({
              collector: r.name,
              accountsHeld: r.accountsHeld,
              amountCollected: r.amountCollected,
              dcrsSubmitted: r.dcrsSubmitted,
              dcrsReconciled: r.dcrsReconciled,
              rejectionRatePct: Math.round(r.rejectionRatePct * 10) / 10,
              avgCycleDays: r.avgCycleDays,
            })))
          }
        >
          Export CSV
        </Button>
      </div>

      <Card className="mb-6">
        <h3 className="mb-3 font-display text-base font-semibold text-navy-900">
          Collector scorecard
        </h3>
        {series.collectorScorecard.length === 0 ? (
          <EmptyState title="No collectors assigned" description="Assign accounts to see scorecards here." showMark={false} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Collector</Th>
                <Th num>Accounts held</Th>
                <Th num>Collected</Th>
                <Th num>Submitted</Th>
                <Th num>Reconciled</Th>
                <Th num>Rejection rate</Th>
                <Th num>Avg. cycle</Th>
              </tr>
            </thead>
            <tbody>
              {series.collectorScorecard.map((row) => (
                <tr key={row.collectorUserId}>
                  <Td>{row.name}</Td>
                  <Td num className="mono">{row.accountsHeld}</Td>
                  <Td num className="mono text-teal-600">{peso(row.amountCollected)}</Td>
                  <Td num className="mono">{row.dcrsSubmitted}</Td>
                  <Td num className="mono">{row.dcrsReconciled}</Td>
                  <Td num>
                    {row.rejectionRatePct > 20 ? (
                      <Badge variant="danger">{Math.round(row.rejectionRatePct * 10) / 10}%</Badge>
                    ) : (
                      <span className="mono">{Math.round(row.rejectionRatePct * 10) / 10}%</span>
                    )}
                  </Td>
                  <Td num className="mono">
                    {row.avgCycleDays !== null ? `${row.avgCycleDays}d` : "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-display text-base font-semibold text-navy-900">
            Committee participation
          </h3>
          {series.committeeParticipation.length === 0 ? (
            <EmptyState title="No votes recorded" description="Committee votes will appear here." showMark={false} />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Member</Th>
                  <Th num>Votes cast</Th>
                  <Th num>Avg. turnaround</Th>
                </tr>
              </thead>
              <tbody>
                {series.committeeParticipation.map((row) => (
                  <tr key={row.voterId}>
                    <Td>{row.name}</Td>
                    <Td num className="mono">{row.votesCast}</Td>
                    <Td num className="mono">
                      {row.avgTurnaroundDays !== null ? `${row.avgTurnaroundDays}d` : "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <h3 className="mb-3 font-display text-base font-semibold text-navy-900">
            Proof-verification backlog
          </h3>
          {backlogData.every((b) => b.count === 0) ? (
            <EmptyState title="Nothing pending" description="No payment proofs are awaiting verification." showMark={false} />
          ) : (
            <RankedBarMini data={backlogData} yKey="label" valueKey="count" color={CHART.warning} height={140} />
          )}
        </Card>
      </div>
    </div>
  );
}
