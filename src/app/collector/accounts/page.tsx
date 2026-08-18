"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  CollectorKpi,
  collectorIconProps,
} from "@/components/collector/CollectorKpi";
import { ContactLogModal } from "@/components/collector/ContactLogModal";
import { DemandLetterModal } from "@/components/collector/DemandLetterModal";
import {
  DateRangeFilter,
  ViewModeToggle,
  type DateRangeValue,
  type HistoryViewMode,
} from "@/components/history";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
  Table,
  Td,
  Th,
  cn,
} from "@/components/ui";
import { masterlistSecondaryIdentity } from "@/lib/ar/masterlist-display";
import {
  agingVariant,
  formatDate,
  formatMoney,
} from "@/lib/collector/format";
import {
  COLLECTOR_QUEUE_PAGE_SIZES,
  callbackDue,
  type CollectorAgingFilter,
  type CollectorQueueKpis,
  type CollectorQueueMappedRow,
  type CollectorQueueSortKey,
  type CollectorSegmentFilter,
} from "@/lib/collector/queue";

type SortKey = CollectorQueueSortKey;

const PAGE_SIZE_OPTIONS = COLLECTOR_QUEUE_PAGE_SIZES;

const DEFAULT_DATE_RANGE: DateRangeValue = {
  preset: "all",
  from: "",
  to: "",
};

const EMPTY_KPI: CollectorQueueKpis = {
  assigned: 0,
  callbackDue: 0,
  agingCritical: 0,
  totalBalance: 0,
};

const AGING_CHIPS: Array<{ id: CollectorAgingFilter; label: string }> = [
  { id: "all", label: "All aging" },
  { id: "current", label: "Current" },
  { id: "1-30", label: "1-30" },
  { id: "31-60", label: "31-60" },
  { id: "61-90", label: "61-90" },
  { id: "91+", label: "91+" },
];

const SEGMENT_CHIPS: Array<{ id: CollectorSegmentFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "seafarer", label: "Seafarer" },
  { id: "sme", label: "SME" },
];

const IconLayers = (
  <svg {...collectorIconProps}>
    <path d="m12 2 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12 9 5 9-5" />
    <path d="m3 17 9 5 9-5" />
  </svg>
);
const IconPhone = (
  <svg {...collectorIconProps}>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);
const IconAlert = (
  <svg {...collectorIconProps}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);
const IconCash = (
  <svg {...collectorIconProps}>
    <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

function dateRangePillLabel(value: DateRangeValue): string {
  if (value.preset === "30d") return "Last 30 days";
  if (value.preset === "90d") return "Last 90 days";
  if (value.preset === "all") return "All time";
  const from = value.from ? formatDate(value.from) : "…";
  const to = value.to ? formatDate(value.to) : "…";
  return `${from} → ${to}`;
}

function agingChipLabel(filter: CollectorAgingFilter): string {
  return AGING_CHIPS.find((chip) => chip.id === filter)?.label ?? filter;
}

function segmentBadge(segment: "sme" | "seafarer") {
  const isSme = segment === "sme";
  return (
    <Badge variant={isSme ? "navy" : "teal"} dot>
      {isSme ? "SME" : "Seafarer"}
    </Badge>
  );
}

function buildQueueQuery(params: {
  search: string;
  aging: CollectorAgingFilter;
  segment: CollectorSegmentFilter;
  dateRange: DateRangeValue;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}): string {
  const qs = new URLSearchParams();
  if (params.search.trim()) qs.set("search", params.search.trim());
  qs.set("aging", params.aging);
  qs.set("segment", params.segment);
  qs.set("range", params.dateRange.preset);
  if (params.dateRange.preset === "custom") {
    if (params.dateRange.from) qs.set("from", params.dateRange.from);
    if (params.dateRange.to) qs.set("to", params.dateRange.to);
  }
  qs.set("sortKey", params.sortKey);
  qs.set("sortDir", params.sortDir);
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  return qs.toString();
}

function secondaryOf(row: CollectorQueueMappedRow) {
  return masterlistSecondaryIdentity({
    manning_agency: row.manningAgency,
    vessel_name: row.vesselName,
  });
}

export default function CollectorAccountsPage() {
  const [rows, setRows] = useState<CollectorQueueMappedRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [kpi, setKpi] = useState<CollectorQueueKpis>(EMPTY_KPI);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [agingFilter, setAgingFilter] = useState<CollectorAgingFilter>("all");
  const [segmentFilter, setSegmentFilter] =
    useState<CollectorSegmentFilter>("all");
  const [dateRange, setDateRange] = useState<DateRangeValue>(DEFAULT_DATE_RANGE);
  const [viewMode, setViewMode] = useState<HistoryViewMode>("list");
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [contactModalFor, setContactModalFor] =
    useState<CollectorQueueMappedRow | null>(null);
  const [demandModalFor, setDemandModalFor] =
    useState<CollectorQueueMappedRow | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    agingFilter,
    segmentFilter,
    dateRange,
    pageSize,
    sortKey,
    sortDir,
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = buildQueueQuery({
        search: debouncedSearch,
        aging: agingFilter,
        segment: segmentFilter,
        dateRange,
        sortKey,
        sortDir,
        page,
        pageSize,
      });
      const res = await fetch(`/api/collector/accounts?${query}`);
      if (!res.ok) throw new Error("Failed to load accounts");
      const data = (await res.json()) as {
        rows: CollectorQueueMappedRow[];
        totalCount: number;
        kpi: CollectorQueueKpis;
      };
      setRows(data.rows ?? []);
      setTotalCount(data.totalCount ?? 0);
      setKpi(data.kpi ?? EMPTY_KPI);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [
    debouncedSearch,
    agingFilter,
    segmentFilter,
    dateRange,
    sortKey,
    sortDir,
    page,
    pageSize,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "borrower" || key === "due" ? "asc" : "desc");
    }
  }

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="arr">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, pageCount);

  const dateIsDefault = dateRange.preset === "all";
  const activeFilterCount =
    (agingFilter !== "all" ? 1 : 0) +
    (segmentFilter !== "all" ? 1 : 0) +
    (dateIsDefault ? 0 : 1);

  const summaryStart = rows.length ? (safePage - 1) * pageSize + 1 : 0;
  const summaryEnd = (safePage - 1) * pageSize + rows.length;

  function renderActionButtons(acc: CollectorQueueMappedRow) {
    return (
      <div className="flex flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap">
        <Link
          href={`/collector/accounts/${acc.id}/case-file`}
          className="btn btn-secondary btn-sm"
        >
          Case file
        </Link>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setDemandModalFor(acc)}
        >
          Demand letter
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setContactModalFor(acc)}
        >
          Log contact
        </Button>
        <Link
          href={`/collector/accounts/${acc.id}/record-payment`}
          className="btn btn-secondary btn-sm"
        >
          Record payment
        </Link>
      </div>
    );
  }

  function renderBorrowerCell(acc: CollectorQueueMappedRow) {
    const secondary = secondaryOf(acc);
    return (
      <>
        <div className="font-medium text-ink-900">{acc.borrowerName}</div>
        {secondary ? (
          <div className="text-xs text-ink-500">{secondary}</div>
        ) : null}
      </>
    );
  }

  function renderNextDue(acc: CollectorQueueMappedRow) {
    if (!acc.nextDueDate) {
      return <span className="text-ink-400">—</span>;
    }
    return (
      <span className="text-sm">
        <span className="mono">{formatDate(acc.nextDueDate)}</span>
        {acc.nextDueAmount != null ? (
          <span className="text-ink-500">
            {" · "}₱{formatMoney(acc.nextDueAmount)}
          </span>
        ) : null}
      </span>
    );
  }

  function renderLastContact(acc: CollectorQueueMappedRow) {
    const overdueCallback = callbackDue(acc.lastContact);
    if (overdueCallback) {
      return <Badge variant="danger">Callback due</Badge>;
    }
    if (acc.lastContact) {
      return (
        <span className="text-sm text-ink-500">
          {acc.lastContact.contactType} {formatDate(acc.lastContact.createdAt)}
        </span>
      );
    }
    return <span className="text-ink-400">—</span>;
  }

  return (
    <div>
      <PageHeader
        title="Assigned accounts"
        description="Borrowers in your collection portfolio."
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="kpi-grid mb-6">
        {loading ? (
          <>
            <Skeleton variant="kpi" />
            <Skeleton variant="kpi" />
            <Skeleton variant="kpi" />
            <Skeleton variant="kpi" />
          </>
        ) : (
          <>
            <CollectorKpi
              tone="navy"
              icon={IconLayers}
              label="Assigned"
              value={kpi.assigned}
            />
            <CollectorKpi
              tone="warning"
              icon={IconPhone}
              label="Callback-due"
              value={kpi.callbackDue}
            />
            <CollectorKpi
              tone="danger"
              icon={IconAlert}
              label="Needs attention"
              value={kpi.agingCritical}
            />
            <CollectorKpi
              tone="teal"
              icon={IconCash}
              label="Total balance"
              value={`₱${formatMoney(kpi.totalBalance)}`}
            />
          </>
        )}
      </div>

      <div className="card mb-4" style={{ overflow: "visible" }}>
        <div className="tbl-toolbar" style={{ padding: "13px 14px" }}>
          <div
            className="gsearch"
            style={{ maxWidth: 300, flex: 1, minWidth: 190 }}
          >
            <span className="icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </span>
            <input
              className="input"
              style={{
                height: 37,
                paddingRight: 12,
                borderRadius: "var(--r-md)",
              }}
              placeholder="Search borrower or account"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {AGING_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={cn("fchip", agingFilter === chip.id && "is-on")}
                onClick={() => setAgingFilter(chip.id)}
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
                className={cn("fchip", segmentFilter === chip.id && "is-on")}
                onClick={() => setSegmentFilter(chip.id)}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div className="active-pill-row">
            {agingFilter !== "all" ? (
              <span className="active-pill">
                Aging: {agingChipLabel(agingFilter)}
                <button
                  type="button"
                  aria-label="Clear aging filter"
                  onClick={() => setAgingFilter("all")}
                >
                  ×
                </button>
              </span>
            ) : null}
            {segmentFilter !== "all" ? (
              <span className="active-pill">
                Segment: {segmentFilter === "sme" ? "SME" : "Seafarer"}
                <button
                  type="button"
                  aria-label="Clear segment filter"
                  onClick={() => setSegmentFilter("all")}
                >
                  ×
                </button>
              </span>
            ) : null}
            {!dateIsDefault ? (
              <span className="active-pill">
                {dateRangePillLabel(dateRange)}
                <button
                  type="button"
                  aria-label="Clear date filter"
                  onClick={() => setDateRange(DEFAULT_DATE_RANGE)}
                >
                  ×
                </button>
              </span>
            ) : null}
            {activeFilterCount > 0 ? (
              <button
                type="button"
                className="clear-link"
                onClick={() => {
                  setAgingFilter("all");
                  setSegmentFilter("all");
                  setDateRange(DEFAULT_DATE_RANGE);
                }}
              >
                Clear all
              </button>
            ) : null}
          </div>

          <div className="sp">
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
            <button
              type="button"
              className={cn("btn btn-outline", filterPanelOpen && "is-on")}
              onClick={() => setFilterPanelOpen((open) => !open)}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                width={16}
                height={16}
                aria-hidden
              >
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              Filters
              {activeFilterCount > 0 ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 16,
                    height: 16,
                    padding: "0 4px",
                    borderRadius: "var(--r-full)",
                    background: "var(--teal-600)",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 700,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        <div className={cn("filter-panel", filterPanelOpen && "is-open")}>
          <div className="filter-group">
            <span className="filter-group-label">First payment date</span>
            <DateRangeFilter value={dateRange} onChange={setDateRange} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mb-4">
          <Table>
            <thead>
              <tr>
                <Th>Borrower</Th>
                <Th>Segment</Th>
                <Th>Account</Th>
                <Th num>Balance</Th>
                <Th>Aging</Th>
                <Th>Next due</Th>
                <Th>Last contact</Th>
                <Th className="w-1">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, i) => (
                <tr key={i}>
                  <Td colSpan={8}>
                    <Skeleton variant="line" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : kpi.assigned === 0 ? (
        <EmptyState
          title="No accounts assigned"
          description="Assigned borrower accounts will appear here."
          showMark={false}
        />
      ) : totalCount === 0 ? (
        <EmptyState
          title="No matching accounts"
          description="Try a different search, aging, segment, or date range."
          showMark={false}
        />
      ) : viewMode === "grid" ? (
        <div className="grid-view mb-4">
          {rows.map((acc) => {
            const secondary = secondaryOf(acc);
            return (
              <div key={acc.id} className="gcard">
                <div className="gcard-top">
                  <span className="gcard-id">
                    {acc.loanAccountNo ?? acc.borrowerNo}
                  </span>
                  <Badge variant={agingVariant(acc.agingBucket)}>
                    {acc.agingBucket}
                  </Badge>
                </div>
                <div className="gcard-name">{acc.borrowerName}</div>
                <div className="gcard-meta">
                  <div className="row">
                    <span className="k">Segment</span>
                    <span className="v">{segmentBadge(acc.segment)}</span>
                  </div>
                  {secondary ? (
                    <div className="row">
                      <span className="k">Identity</span>
                      <span className="v">{secondary}</span>
                    </div>
                  ) : null}
                  <div className="row">
                    <span className="k">Balance</span>
                    <span className="v mono text-teal-600">
                      {formatMoney(acc.outstandingBalance)}
                    </span>
                  </div>
                  <div className="row">
                    <span className="k">Next due</span>
                    <span className="v">{renderNextDue(acc)}</span>
                  </div>
                  <div className="row">
                    <span className="k">Last contact</span>
                    <span className="v">{renderLastContact(acc)}</span>
                  </div>
                </div>
                {renderActionButtons(acc)}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mb-4">
          <Table className={viewMode === "compact" ? "is-compact" : undefined}>
            <thead>
              <tr>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("borrower")}
                >
                  Borrower
                  {sortArrow("borrower")}
                </Th>
                <Th>Segment</Th>
                <Th>Account</Th>
                <Th
                  num
                  className="sortable"
                  onClick={() => toggleSort("balance")}
                >
                  Balance
                  {sortArrow("balance")}
                </Th>
                <Th
                  className="sortable"
                  onClick={() => toggleSort("priority")}
                >
                  Aging
                  {sortArrow("priority")}
                </Th>
                <Th className="sortable" onClick={() => toggleSort("due")}>
                  Next due
                  {sortArrow("due")}
                </Th>
                <Th>Last contact</Th>
                <Th className="w-1">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((acc) => (
                <tr key={acc.id}>
                  <Td>{renderBorrowerCell(acc)}</Td>
                  <Td>{segmentBadge(acc.segment)}</Td>
                  <Td className="mono">{acc.loanAccountNo ?? "—"}</Td>
                  <Td num className="mono text-teal-600">
                    {formatMoney(acc.outstandingBalance)}
                  </Td>
                  <Td>
                    <Badge variant={agingVariant(acc.agingBucket)}>
                      {acc.agingBucket}
                    </Badge>
                  </Td>
                  <Td>{renderNextDue(acc)}</Td>
                  <Td>{renderLastContact(acc)}</Td>
                  <Td>{renderActionButtons(acc)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-400">
          <span>Show</span>
          <Select
            value={String(pageSize)}
            onChange={(e) => {
              setPageSize(
                Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number],
              );
            }}
            style={{ width: 72, height: 34 }}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </Select>
          <span>per page</span>
        </div>
        <Pagination
          page={safePage}
          pageCount={pageCount}
          onPageChange={setPage}
          summary={`Showing ${summaryStart}–${summaryEnd} of ${totalCount}`}
        />
      </div>

      {contactModalFor ? (
        <ContactLogModal
          open={contactModalFor !== null}
          borrowerName={contactModalFor.borrowerName}
          masterlistId={contactModalFor.id}
          onClose={() => setContactModalFor(null)}
          onLogged={() => void load()}
        />
      ) : null}

      {demandModalFor ? (
        <DemandLetterModal
          open={demandModalFor !== null}
          borrowerName={demandModalFor.borrowerName}
          masterlistId={demandModalFor.id}
          onClose={() => setDemandModalFor(null)}
        />
      ) : null}

    </div>
  );
}
