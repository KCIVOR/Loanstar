"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ViewModeToggle,
  type HistoryViewMode,
} from "@/components/history";
import {
  Alert,
  Button,
  cn,
  EmptyState,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { formatDate } from "@/lib/csa/format";
import {
  CSA_LEADS_LIST_PAGE_SIZES,
  clampCsaLeadsListPageSize,
  computeCsaLeadsListKpis,
  csaLeadSearchPredicate,
  daysWaiting,
  passesWaitingBucket,
  sortLeadsByCreatedAt,
  waitingBucketFilterSpec,
  type CsaLeadListRow,
  type CsaLeadsWaitingBucket,
} from "@/lib/csa/leads-list";

const PAGE_SIZE_OPTIONS = CSA_LEADS_LIST_PAGE_SIZES;

const WAITING_CHIPS: Array<{ id: CsaLeadsWaitingBucket; label: string }> = [
  { id: "all", label: "All" },
  { id: "1-3", label: "1–3 days" },
  { id: "4-7", label: "4–7 days" },
  { id: "8+", label: "8+ days" },
];

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const IconLayers = (
  <svg {...iconProps}>
    <path d="m12 2 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12 9 5 9-5" />
    <path d="m3 17 9 5 9-5" />
  </svg>
);

const IconClock = (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);

const KPI_TONES = {
  navy: { background: "var(--navy-50)", color: "var(--navy-700)" },
  warning: { background: "var(--warning-bg)", color: "var(--warning)" },
} as const;

function Kpi({
  tone,
  icon,
  label,
  value,
}: {
  tone: keyof typeof KPI_TONES;
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="kpi flex h-full w-full flex-col text-left">
      <span className="ic" style={KPI_TONES[tone]}>
        {icon}
      </span>
      <div className="k">{label}</div>
      <div className="v">{value}</div>
    </div>
  );
}

function waitingChipLabel(filter: CsaLeadsWaitingBucket): string {
  return WAITING_CHIPS.find((chip) => chip.id === filter)?.label ?? filter;
}

function formatWaitingDays(days: number | null): string {
  if (days == null) return "—";
  if (days === 0) return "Today";
  return `${days}d`;
}

function agentLabel(lead: CsaLeadListRow): string {
  return lead.agentName ?? "Agent referral";
}

function startApplicationHref(lead: CsaLeadListRow): string {
  return `/csa/applications/new?leadId=${encodeURIComponent(lead.id)}&name=${encodeURIComponent(lead.borrowerName)}`;
}

function renderStartButton(lead: CsaLeadListRow) {
  return (
    <Link href={startApplicationHref(lead)}>
      <Button variant="secondary" size="sm">
        Start application
      </Button>
    </Link>
  );
}

export default function CsaLeadsPage() {
  const [leads, setLeads] = useState<CsaLeadListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [waitingFilter, setWaitingFilter] =
    useState<CsaLeadsWaitingBucket>("all");
  const [referredSortDir, setReferredSortDir] = useState<"asc" | "desc" | null>(
    null,
  );
  const [viewMode, setViewMode] = useState<HistoryViewMode>("list");
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/csa/leads");
      if (!res.ok) throw new Error("Failed to load leads");
      const data = (await res.json()) as { leads: CsaLeadListRow[] };
      setLeads(data.leads ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, waitingFilter, pageSize, referredSortDir]);

  function toggleReferredSort() {
    setReferredSortDir((prev) => {
      if (prev === null) return "desc";
      return prev === "asc" ? "desc" : "asc";
    });
  }

  function setWaiting(raw: string) {
    setWaitingFilter(waitingBucketFilterSpec(raw));
  }

  const kpi = useMemo(() => computeCsaLeadsListKpis(leads), [leads]);

  const filtered = useMemo(() => {
    const searched = leads.filter((item) =>
      csaLeadSearchPredicate(item, search),
    );
    const bucketed = searched.filter((item) =>
      passesWaitingBucket(daysWaiting(item.createdAt), waitingFilter),
    );
    return referredSortDir === null
      ? bucketed
      : sortLeadsByCreatedAt(bucketed, referredSortDir);
  }, [leads, search, waitingFilter, referredSortDir]);

  const safePageSize = clampCsaLeadsListPageSize(pageSize);
  const totalCount = filtered.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / safePageSize));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * safePageSize;
  const rows = filtered.slice(pageStart, pageStart + safePageSize);
  const summaryStart = rows.length ? pageStart + 1 : 0;
  const summaryEnd = pageStart + rows.length;

  const activeFilterCount = waitingFilter !== "all" ? 1 : 0;

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Open name-only referrals waiting for CSA to start an application."
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="kpi-grid mb-4">
        {loading ? (
          <>
            <Skeleton variant="kpi" />
            <Skeleton variant="kpi" />
          </>
        ) : (
          <>
            <Kpi
              tone="navy"
              icon={IconLayers}
              label="Open leads"
              value={kpi.open}
            />
            <Kpi
              tone="warning"
              icon={IconClock}
              label="Oldest waiting"
              value={
                kpi.oldestWaitingDays === 0 ? 0 : `${kpi.oldestWaitingDays}d`
              }
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
              placeholder="Search borrower or agent…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="active-pill-row">
            {waitingFilter !== "all" ? (
              <span className="active-pill">
                Waiting: {waitingChipLabel(waitingFilter)}
                <button
                  type="button"
                  aria-label="Clear waiting filter"
                  onClick={() => setWaiting("all")}
                >
                  ×
                </button>
              </span>
            ) : null}
            {activeFilterCount > 0 ? (
              <button
                type="button"
                className="clear-link"
                onClick={() => setWaiting("all")}
              >
                Clear
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
            <span className="filter-group-label">Waiting</span>
            <div className="flex flex-wrap gap-1.5">
              {WAITING_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={cn("fchip", waitingFilter === chip.id && "is-on")}
                  onClick={() => setWaiting(chip.id)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mb-4">
          <Table>
            <thead>
              <tr>
                <Th>Borrower</Th>
                <Th>Agent</Th>
                <Th>Referred</Th>
                <Th>Waiting</Th>
                <Th className="w-1">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, i) => (
                <tr key={i}>
                  <Td colSpan={5}>
                    <Skeleton variant="line" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : kpi.open === 0 ? (
        <EmptyState
          title="No open leads"
          description="Agent referrals will appear here until CSA starts an application from them."
        />
      ) : totalCount === 0 ? (
        <EmptyState
          title="No matching leads"
          description="Try a different search term or waiting filter."
          showMark={false}
        />
      ) : viewMode === "grid" ? (
        <div className="grid-view mb-4">
          {rows.map((lead) => {
            const waiting = daysWaiting(lead.createdAt);
            return (
              <div key={lead.id} className="gcard">
                <div className="gcard-name">{lead.borrowerName}</div>
                {lead.businessName ? (
                  <div className="mt-0.5 text-[12px] text-ink-400">
                    {lead.businessName}
                  </div>
                ) : null}
                <div className="gcard-meta">
                  <div className="row">
                    <span className="k">Agent</span>
                    <span className="v">{agentLabel(lead)}</span>
                  </div>
                  <div className="row">
                    <span className="k">Referred</span>
                    <span className="v mono">{formatDate(lead.createdAt)}</span>
                  </div>
                  <div className="row">
                    <span className="k">Waiting</span>
                    <span className="v mono">{formatWaitingDays(waiting)}</span>
                  </div>
                </div>
                {renderStartButton(lead)}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mb-4">
          <Table className={viewMode === "compact" ? "is-compact" : undefined}>
            <thead>
              <tr>
                <Th>Borrower</Th>
                <Th>Agent</Th>
                <Th className="sortable" onClick={toggleReferredSort}>
                  Referred
                  {referredSortDir ? (
                    <span className="arr">
                      {referredSortDir === "asc" ? "▲" : "▼"}
                    </span>
                  ) : null}
                </Th>
                <Th>Waiting</Th>
                <Th className="w-1">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((lead) => {
                const waiting = daysWaiting(lead.createdAt);
                return (
                  <tr key={lead.id}>
                    <Td>
                      <div className="font-medium text-ink-900">
                        {lead.borrowerName}
                      </div>
                      {lead.businessName ? (
                        <div className="mt-0.5 text-[12px] text-ink-400">
                          {lead.businessName}
                        </div>
                      ) : null}
                    </Td>
                    <Td>{agentLabel(lead)}</Td>
                    <Td className="mono">{formatDate(lead.createdAt)}</Td>
                    <Td className="mono">{formatWaitingDays(waiting)}</Td>
                    <Td>{renderStartButton(lead)}</Td>
                  </tr>
                );
              })}
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
    </div>
  );
}
