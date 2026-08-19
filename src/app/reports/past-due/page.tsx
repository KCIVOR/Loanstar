"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { SegmentBadge } from "@/components/reports/SegmentBadge";
import { usePermissions } from "@/hooks/usePermissions";
import { formatMoney } from "@/lib/ar/format";
import { downloadCsv } from "@/lib/reports/csv";
import {
  paginateRows,
  PAGE_SIZES,
  type PastDueAging,
  type PastDueRow,
} from "@/lib/reports/registers";
import {
  COLLATERAL_CHIPS,
  SEGMENT_CHIPS,
  collateralLabel,
  parseReportCollateral,
  parseReportSegment,
  segmentLabel,
} from "@/lib/reports/segments";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  KpiCard,
  PageHeader,
  Pagination,
  Select,
  Spinner,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { cn } from "@/components/ui/cn";

type PastDueResponse = {
  rows: PastDueRow[];
  kpis: { count: number; outstanding: number };
};

const AGING_CHIPS: Array<{ id: PastDueAging; label: string }> = [
  { id: "all", label: "All past due" },
  { id: "1-30", label: "1–30" },
  { id: "31-60", label: "31–60" },
  { id: "61-90", label: "61–90" },
  { id: "91+", label: "91+" },
];

function parseAging(value: string | null): PastDueAging {
  if (value === "1-30" || value === "31-60" || value === "61-90" || value === "91+" || value === "par30") {
    return value;
  }
  return "all";
}

function ownerName(row: PastDueRow): string {
  if (row.accountStatus === "remedial") return row.remedialName ?? row.collectorName ?? "—";
  return row.collectorName ?? "—";
}

export default function ReportsPastDuePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = usePermissions();
  const canOpenAr = can("accounting_ar", "view");

  const aging = parseAging(searchParams.get("aging"));
  const segment = parseReportSegment(searchParams.get("segment"));
  const collateral = parseReportCollateral(searchParams.get("collateral"));
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const [data, setData] = useState<PastDueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(20);

  const setParams = useCallback(
    (patch: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        params.set(key, value);
      }
      router.replace(`/reports/past-due?${params.toString()}`);
      setPage(1);
    },
    [router, searchParams],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ aging, segment, collateral });
    void fetch(`/api/reports/past-due?${params.toString()}`)
      .then(async (res) => {
        const body = (await res.json()) as PastDueResponse & { error?: string };
        if (!res.ok) throw new Error(body.error ?? "Failed to load past due");
        if (!cancelled) {
          setData(body);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load past due");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [aging, segment, collateral]);

  const paged = useMemo(
    () => paginateRows(data?.rows ?? [], page, pageSize),
    [data, page, pageSize],
  );

  return (
    <div>
      <PageHeader
        title="Past due"
        description="Accounts past current, with days late from the oldest unpaid installment."
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
              disabled={!data?.rows.length}
              onClick={() => {
                if (!data) return;
                downloadCsv(
                  "reports-past-due.csv",
                  data.rows.map((row) => ({
                    borrower: row.borrowerName,
                    accountNo: row.loanAccountNo,
                    segment: segmentLabel(row.segment),
                    collateral: collateralLabel(row.collateralType),
                    aging: row.agingBucket,
                    daysLate: row.daysLate,
                    outstanding: row.outstanding,
                    owner: ownerName(row),
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
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            {AGING_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={cn("fchip", aging === chip.id && "is-on")}
                onClick={() => setParams({ aging: chip.id })}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SEGMENT_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={cn("fchip", segment === chip.id && "is-on")}
                onClick={() => setParams({ segment: chip.id })}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {COLLATERAL_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={cn("fchip", collateral === chip.id && "is-on")}
                onClick={() => setParams({ collateral: chip.id })}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
        {aging === "par30" ? (
          <p className="mt-2 text-xs text-ink-400">Showing PAR &gt; 30 (31–60, 61–90, 91+).</p>
        ) : null}
      </Card>

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-3.5">
        <KpiCard label="Accounts" value={data?.kpis.count ?? 0} />
        <KpiCard label="Outstanding" value={formatMoney(data?.kpis.outstanding ?? 0)} highlight />
      </div>

      {loading && !data ? (
        <Spinner />
      ) : !data?.rows.length ? (
        <EmptyState title="No past-due accounts" description="Nothing in this aging bucket." />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Borrower</Th>
                <Th>Account</Th>
                <Th>Segment</Th>
                <Th>Collateral</Th>
                <Th>Aging</Th>
                <Th num>Days late</Th>
                <Th num>Outstanding</Th>
                <Th>Owner</Th>
              </tr>
            </thead>
            <tbody>
              {paged.slice.map((row) => {
                const href = `/ar/masterlist/${row.masterlistId}`;
                const name = row.borrowerName || "—";
                const account = row.loanAccountNo ?? "—";
                return (
                  <tr key={row.masterlistId}>
                    <Td>
                      {canOpenAr ? (
                        <Link href={href} className="font-medium text-teal-700 hover:underline">
                          {name}
                        </Link>
                      ) : (
                        name
                      )}
                    </Td>
                    <Td className="mono">
                      {canOpenAr ? (
                        <Link href={href} className="font-medium text-teal-700 hover:underline">
                          {account}
                        </Link>
                      ) : (
                        account
                      )}
                    </Td>
                    <Td>
                      <SegmentBadge segment={row.segment} />
                    </Td>
                    <Td>{collateralLabel(row.collateralType)}</Td>
                    <Td className="mono">{row.agingBucket}</Td>
                    <Td num>{row.daysLate}</Td>
                    <Td num>{formatMoney(row.outstanding)}</Td>
                    <Td>{ownerName(row)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-ink-500">
              Rows
              <Select
                value={String(pageSize)}
                onChange={(event) => {
                  setPageSize(Number(event.target.value) as (typeof PAGE_SIZES)[number]);
                  setPage(1);
                }}
                style={{ width: 80 }}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </Select>
            </label>
            <Pagination
              page={paged.page}
              pageCount={paged.pageCount}
              onPageChange={setPage}
              summary={`${data.rows.length} rows`}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
