"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Alert,
  Badge,
  Button,
  cn,
  EmptyState,
  PageHeader,
  Pagination,
  Spinner,
  Table,
  Td,
  Th,
} from "@/components/ui";
import {
  formatStatusLabel,
  statusBadgeVariant,
} from "@/lib/applications/status";
import { formatDate } from "@/lib/csa/format";
import {
  csaMatchesWorkFilter,
  csaNeedsAttention,
  daysInQueue,
  formatBlockerLabel,
  type CsaWorkFilter,
} from "@/lib/csa/queue";

type QueueItem = {
  id: string;
  applicationNo: string | null;
  status: string;
  blocker: string | null;
  isReloan: boolean;
  createdAt: string;
  updatedAt: string;
  borrower: {
    borrowerNo: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
};

const PAGE_SIZE = 10;

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
const IconAlert = (
  <svg {...iconProps}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);
const IconFile = (
  <svg {...iconProps}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6" />
  </svg>
);
const IconHandshake = (
  <svg {...iconProps}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const KPI_TONES = {
  navy: { background: "var(--navy-50)", color: "var(--navy-700)" },
  danger: { background: "var(--danger-bg)", color: "var(--danger)" },
  warning: { background: "var(--warning-bg)", color: "var(--warning)" },
  teal: { background: "var(--teal-50)", color: "var(--teal-700)" },
} as const;

function Kpi({
  tone,
  icon,
  label,
  value,
  active,
  onClick,
}: {
  tone: keyof typeof KPI_TONES;
  icon: React.ReactNode;
  label: string;
  value: number;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "kpi flex h-full w-full flex-col text-left transition-[box-shadow,border-color]",
        active && "ring-2 ring-teal-600 ring-offset-2 ring-offset-canvas",
      )}
    >
      <span className="ic" style={KPI_TONES[tone]}>
        {icon}
      </span>
      <div className="k">{label}</div>
      <div className="v">{value}</div>
    </button>
  );
}

type SortKey = "priority" | "filed" | "waiting" | "status";

const WORK_CHIPS: Array<{ id: CsaWorkFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "attention", label: "Needs attention" },
  { id: "documents", label: "Documents" },
  { id: "negotiation", label: "Negotiation" },
];

export default function CsaDashboardPage() {
  const [applications, setApplications] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [workFilter, setWorkFilter] = useState<CsaWorkFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const appsRes = await fetch("/api/csa/applications");
      if (!appsRes.ok) throw new Error("Failed to load queue");
      const data = (await appsRes.json()) as { applications: QueueItem[] };
      setApplications(data.applications);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const total = applications.length;
  const needsAttention = applications.filter((a) =>
    csaNeedsAttention({ status: a.status, blocker: a.blocker }),
  ).length;
  const documentsPending = applications.filter((a) =>
    csaMatchesWorkFilter({ status: a.status, blocker: a.blocker }, "documents"),
  ).length;
  const inNegotiation = applications.filter((a) =>
    csaMatchesWorkFilter(
      { status: a.status, blocker: a.blocker },
      "negotiation",
    ),
  ).length;

  function setFilter(next: CsaWorkFilter) {
    setWorkFilter(next);
    setPage(1);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "filed" || key === "waiting" ? "desc" : "asc");
    }
    setPage(1);
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return applications.filter((app) => {
      if (
        !csaMatchesWorkFilter(
          { status: app.status, blocker: app.blocker },
          workFilter,
        )
      ) {
        return false;
      }
      if (!term) return true;
      const name = app.borrower
        ? `${app.borrower.firstName} ${app.borrower.lastName}`.toLowerCase()
        : "";
      return (
        name.includes(term) ||
        (app.borrower?.borrowerNo.toLowerCase().includes(term) ?? false) ||
        (app.borrower?.email.toLowerCase().includes(term) ?? false) ||
        (app.applicationNo?.toLowerCase().includes(term) ?? false)
      );
    });
  }, [applications, search, workFilter]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "filed") {
        return (
          dir *
          (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        );
      }
      if (sortKey === "waiting") {
        return (
          dir *
          (daysInQueue(a.updatedAt ?? a.createdAt) -
            daysInQueue(b.updatedAt ?? b.createdAt))
        );
      }
      if (sortKey === "status") {
        return dir * a.status.localeCompare(b.status);
      }
      const aFlag = csaNeedsAttention({
        status: a.status,
        blocker: a.blocker,
      })
        ? 0
        : 1;
      const bFlag = csaNeedsAttention({
        status: b.status,
        blocker: b.blocker,
      })
        ? 0
        : 1;
      if (aFlag !== bFlag) return aFlag - bFlag;
      return (
        new Date(b.updatedAt ?? b.createdAt).getTime() -
        new Date(a.updatedAt ?? a.createdAt).getTime()
      );
    });
  }, [filtered, sortDir, sortKey]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="arr">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="CSA intake queue"
        description="Applications pending intake, computation, and endorsement to CIG."
        actions={
          <Link href="/csa/applications/new">
            <Button>New application</Button>
          </Link>
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {needsAttention > 0 ? (
        <div className="banner warn mb-6">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
          <span>
            <span className="mono font-semibold">{needsAttention}</span> file
            {needsAttention === 1 ? "" : "s"} need attention (hold, revision, or
            blocker)
          </span>
          <span className="sp">
            <button
              type="button"
              className="text-[13px] font-semibold underline-offset-2 hover:underline"
              onClick={() => setFilter("attention")}
            >
              Show attention queue
            </button>
          </span>
        </div>
      ) : null}

      <div className="kpi-grid mb-4">
        <Kpi
          tone="navy"
          icon={IconLayers}
          label="In queue"
          value={total}
          active={workFilter === "all"}
          onClick={() => setFilter("all")}
        />
        <Kpi
          tone="danger"
          icon={IconAlert}
          label="Needs attention"
          value={needsAttention}
          active={workFilter === "attention"}
          onClick={() => setFilter("attention")}
        />
        <Kpi
          tone="warning"
          icon={IconFile}
          label="Documents"
          value={documentsPending}
          active={workFilter === "documents"}
          onClick={() => setFilter("documents")}
        />
        <Kpi
          tone="teal"
          icon={IconHandshake}
          label="In negotiation"
          value={inNegotiation}
          active={workFilter === "negotiation"}
          onClick={() => setFilter("negotiation")}
        />
      </div>

      {applications.length === 0 ? (
        <EmptyState
          title="Queue is clear"
          description="No applications in the intake queue."
          action={
            <Link href="/csa/applications/new">
              <Button>New application</Button>
            </Link>
          }
        />
      ) : (
        <div className="rounded-[var(--r-lg)] border border-line-soft bg-surface-2/50 p-4 sm:p-5">
          <div className="tbl-toolbar mb-3.5 flex flex-wrap items-center gap-2">
            <div className="gsearch" style={{ maxWidth: 280 }}>
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
                  height: 36,
                  paddingRight: 12,
                  borderRadius: "var(--r-md)",
                }}
                placeholder="Search name, email, or app no."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {WORK_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={cn("fchip", workFilter === chip.id && "is-on")}
                  onClick={() => setFilter(chip.id)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {sorted.length ? (
            <>
              <div className="tbl-wrap">
                <Table>
                  <thead>
                    <tr>
                      <Th>Borrower</Th>
                      <Th>Type</Th>
                      <Th
                        className="sortable"
                        onClick={() => toggleSort("status")}
                      >
                        Status
                        {sortArrow("status")}
                      </Th>
                      <Th>Blocker</Th>
                      <Th
                        className="sortable"
                        onClick={() => toggleSort("filed")}
                      >
                        Filed
                        {sortArrow("filed")}
                      </Th>
                      <Th
                        className="sortable"
                        onClick={() => toggleSort("waiting")}
                      >
                        Waiting
                        {sortArrow("waiting")}
                      </Th>
                      <Th className="w-1">{""}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((app) => {
                      const attention = csaNeedsAttention({
                        status: app.status,
                        blocker: app.blocker,
                      });
                      const blocker = formatBlockerLabel(app.blocker);
                      const waiting = daysInQueue(
                        app.updatedAt ?? app.createdAt,
                      );
                      return (
                        <tr
                          key={app.id}
                          className={cn(
                            attention &&
                              "bg-[color-mix(in_srgb,var(--warning-bg)_55%,transparent)]",
                          )}
                        >
                          <Td>
                            <div className="font-medium text-ink-900">
                              {app.borrower
                                ? `${app.borrower.firstName} ${app.borrower.lastName}`
                                : "Unknown borrower"}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-ink-400">
                              <span className="id">
                                {app.applicationNo ??
                                  app.borrower?.borrowerNo ??
                                  app.id.slice(0, 8)}
                              </span>
                              {app.borrower?.email ? (
                                <span className="truncate">
                                  {app.borrower.email}
                                </span>
                              ) : null}
                            </div>
                          </Td>
                          <Td>{app.isReloan ? "Reloan" : "New loan"}</Td>
                          <Td>
                            <Badge variant={statusBadgeVariant(app.status)} dot>
                              {formatStatusLabel(app.status)}
                            </Badge>
                          </Td>
                          <Td>
                            {blocker ? (
                              <p
                                className="max-w-[14rem] truncate text-sm text-ink-700"
                                title={blocker}
                              >
                                {blocker}
                              </p>
                            ) : (
                              <span className="text-ink-300">—</span>
                            )}
                          </Td>
                          <Td className="mono">{formatDate(app.createdAt)}</Td>
                          <Td className="mono">
                            {waiting === 0 ? "Today" : `${waiting}d`}
                          </Td>
                          <Td>
                            <Link href={`/csa/applications/${app.id}`}>
                              <Button variant="secondary" size="sm">
                                Open
                              </Button>
                            </Link>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>

              <div className="mt-4">
                <Pagination
                  page={safePage}
                  pageCount={pageCount}
                  onPageChange={setPage}
                  summary={`Showing ${
                    paged.length ? (safePage - 1) * PAGE_SIZE + 1 : 0
                  }–${
                    (safePage - 1) * PAGE_SIZE + paged.length
                  } of ${sorted.length}`}
                />
              </div>
            </>
          ) : (
            <EmptyState
              title="No matching applications"
              description="Try a different search term or work filter."
              showMark={false}
            />
          )}
        </div>
      )}
    </div>
  );
}
