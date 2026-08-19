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
  type BorrowerRegisterRow,
  type LoanRegisterRow,
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
  SegmentedControl,
  Select,
  Spinner,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { cn } from "@/components/ui/cn";

type View = "loans" | "borrowers";
type StatusFilter = "unpaid" | "paid" | "all";
type AgingFilter = "all" | "current" | "1-30" | "31-60" | "61-90" | "91+";

type AccountsResponse = {
  view: View;
  rows: Array<LoanRegisterRow | BorrowerRegisterRow>;
  kpis: { count: number; outstanding: number };
};

const AGING_CHIPS: Array<{ id: AgingFilter; label: string }> = [
  { id: "all", label: "All aging" },
  { id: "current", label: "Current" },
  { id: "1-30", label: "1-30" },
  { id: "31-60", label: "31-60" },
  { id: "61-90", label: "61-90" },
  { id: "91+", label: "91+" },
];

const STATUS_CHIPS: Array<{ id: StatusFilter; label: string }> = [
  { id: "unpaid", label: "Unpaid" },
  { id: "paid", label: "Paid" },
  { id: "all", label: "All" },
];

function isView(value: string | null): value is View {
  return value === "loans" || value === "borrowers";
}

function NameCell({
  href,
  canLink,
  children,
}: {
  href: string;
  canLink: boolean;
  children: string;
}) {
  if (canLink) {
    return (
      <Link href={href} className="font-medium text-teal-700 hover:underline">
        {children}
      </Link>
    );
  }
  return <span>{children}</span>;
}

export default function ReportsAccountsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = usePermissions();
  const canOpenAr = can("accounting_ar", "view");

  const viewParam = searchParams.get("view");
  const view: View = isView(viewParam) ? viewParam : "loans";
  const status = (searchParams.get("status") as StatusFilter | null) ?? "unpaid";
  const segment = parseReportSegment(searchParams.get("segment"));
  const collateral = parseReportCollateral(searchParams.get("collateral"));
  const aging = (searchParams.get("aging") as AgingFilter | null) ?? "all";
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const [data, setData] = useState<AccountsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(20);

  const setParams = useCallback(
    (patch: Record<string, string>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        next.set(key, value);
      }
      router.replace(`/reports/accounts?${next.toString()}`);
      setPage(1);
    },
    [router, searchParams],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({
      view,
      status,
      segment,
      collateral,
      aging,
    });
    void fetch(`/api/reports/accounts?${params.toString()}`)
      .then(async (res) => {
        const body = (await res.json()) as AccountsResponse & { error?: string };
        if (!res.ok) throw new Error(body.error ?? "Failed to load accounts");
        if (!cancelled) {
          setData(body);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load accounts");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, status, segment, collateral, aging]);

  const paged = useMemo(
    () => paginateRows(data?.rows ?? [], page, pageSize),
    [data, page, pageSize],
  );

  function exportCsv() {
    if (!data) return;
    if (view === "borrowers") {
      downloadCsv(
        "reports-accounts-borrowers.csv",
        (data.rows as BorrowerRegisterRow[]).map((row) => ({
          name: row.name,
          loans: row.loanCount,
          outstanding: row.outstanding,
          worstAging: row.worstAging,
          segment: segmentLabel(row.segment),
        })),
      );
      return;
    }
    downloadCsv(
      "reports-accounts-loans.csv",
      (data.rows as LoanRegisterRow[]).map((row) => ({
        accountNo: row.loanAccountNo,
        borrower: row.borrowerName,
        segment: segmentLabel(row.segment),
        collateral: collateralLabel(row.collateralType),
        status: row.accountStatus,
        aging: row.agingBucket,
        outstanding: row.outstanding,
        collector: row.collectorName,
      })),
    );
  }

  const periodNote =
    from && to ? (
      <span className="mono text-xs text-ink-400">
        {from} → {to}
      </span>
    ) : null;

  return (
    <div>
      <PageHeader
        title="Accounts"
        description="Every live loan, or one row per borrower."
        actions={
          <div className="flex items-center gap-2">
            {periodNote}
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data?.rows.length}>
              Export CSV
            </Button>
          </div>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            value={view}
            onChange={(next) => setParams({ view: next })}
            options={[
              { value: "loans", label: "Loans" },
              { value: "borrowers", label: "Borrowers" },
            ]}
          />
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
          {view === "loans" ? (
            <div className="flex flex-wrap gap-1.5">
              {STATUS_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={cn("fchip", status === chip.id && "is-on")}
                  onClick={() => setParams({ status: chip.id })}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </Card>

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-3.5">
        <KpiCard label={view === "loans" ? "Loans" : "Borrowers"} value={data?.kpis.count ?? 0} />
        <KpiCard
          label="Outstanding"
          value={formatMoney(data?.kpis.outstanding ?? 0)}
          highlight
        />
      </div>

      {loading && !data ? (
        <Spinner />
      ) : !data?.rows.length ? (
        <EmptyState title="No accounts" description="Nothing matches these filters." />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                {view === "loans" ? (
                  <>
                    <Th>Account no.</Th>
                    <Th>Borrower</Th>
                    <Th>Segment</Th>
                    <Th>Collateral</Th>
                    <Th>Status</Th>
                    <Th>Aging</Th>
                    <Th className="text-right">Outstanding</Th>
                    <Th>Collector</Th>
                  </>
                ) : (
                  <>
                    <Th>Name</Th>
                    <Th>Loans</Th>
                    <Th className="text-right">Outstanding</Th>
                    <Th>Worst aging</Th>
                    <Th>Segment</Th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {view === "loans"
                ? (paged.slice as LoanRegisterRow[]).map((row) => (
                    <tr key={row.masterlistId}>
                      <Td className="mono">
                        <NameCell
                          href={`/ar/masterlist/${row.masterlistId}`}
                          canLink={canOpenAr}
                        >
                          {row.loanAccountNo ?? "—"}
                        </NameCell>
                      </Td>
                      <Td>
                        <NameCell
                          href={`/ar/masterlist/${row.masterlistId}`}
                          canLink={canOpenAr}
                        >
                          {row.borrowerName || "—"}
                        </NameCell>
                      </Td>
                      <Td>
                        <SegmentBadge segment={row.segment} />
                      </Td>
                      <Td>{collateralLabel(row.collateralType)}</Td>
                      <Td className="capitalize">{row.accountStatus}</Td>
                      <Td className="mono">{row.agingBucket}</Td>
                      <Td className="mono text-right">{formatMoney(row.outstanding)}</Td>
                      <Td>{row.collectorName ?? "—"}</Td>
                    </tr>
                  ))
                : (paged.slice as BorrowerRegisterRow[]).map((row) => (
                    <tr key={row.borrowerId}>
                      <Td>
                        <NameCell
                          href={`/ar/masterlist/${row.largestMasterlistId}`}
                          canLink={canOpenAr}
                        >
                          {row.name || "—"}
                        </NameCell>
                      </Td>
                      <Td className="mono">{row.loanCount}</Td>
                      <Td className="mono text-right">{formatMoney(row.outstanding)}</Td>
                      <Td className="mono">{row.worstAging}</Td>
                      <Td>
                        <SegmentBadge segment={row.segment} />
                      </Td>
                    </tr>
                  ))}
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
