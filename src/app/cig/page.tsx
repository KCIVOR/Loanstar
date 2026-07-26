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
import {
  cigMatchesWorkFilter,
  cigNeedsAttention,
  cigNextActionLabel,
  daysSince,
  type CigWorkFilter,
} from "@/lib/cig/desk";
import { formatDate } from "@/lib/cig/format";

type QueueItem = {
  id: string;
  applicationNo: string | null;
  status: string;
  endorsedAt: string | null;
  createdAt: string;
  borrower: {
    borrowerNo: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  isRevision: boolean;
  callbackOverdueAt: string | null;
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
const IconClock = (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);
const IconCheck = (
  <svg {...iconProps}>
    <path d="M20 6 9 17l-5-5" />
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

type SortKey = "priority" | "endorsed" | "waiting" | "status";

const WORK_CHIPS: Array<{ id: CigWorkFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "revisions", label: "Revisions" },
  { id: "callback_overdue", label: "Callback overdue" },
  { id: "endorsed_today", label: "Endorsed today" },
];

export default function CigDashboardPage() {
  const [applications, setApplications] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [workFilter, setWorkFilter] = useState<CigWorkFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const queueRes = await fetch("/api/cig/applications");
      if (!queueRes.ok) throw new Error("Failed to load queue");
      const data = (await queueRes.json()) as { applications: QueueItem[] };
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
    cigNeedsAttention({
      isRevision: a.isRevision,
      callbackOverdueAt: a.callbackOverdueAt,
    }),
  ).length;
  const revisions = applications.filter((a) => a.isRevision).length;
  const callbackOverdue = applications.filter((a) =>
    Boolean(a.callbackOverdueAt),
  ).length;
  const endorsedToday = applications.filter((a) =>
    cigMatchesWorkFilter(
      {
        isRevision: a.isRevision,
        callbackOverdueAt: a.callbackOverdueAt,
        endorsedAt: a.endorsedAt,
      },
      "endorsed_today",
    ),
  ).length;

  function setFilter(next: CigWorkFilter) {
    setWorkFilter(next);
    setPage(1);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "endorsed" || key === "waiting" ? "asc" : "asc");
    }
    setPage(1);
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return applications.filter((app) => {
      if (
        !cigMatchesWorkFilter(
          {
            isRevision: app.isRevision,
            callbackOverdueAt: app.callbackOverdueAt,
            endorsedAt: app.endorsedAt,
          },
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
      if (sortKey === "endorsed") {
        const aTime = a.endorsedAt ? new Date(a.endorsedAt).getTime() : 0;
        const bTime = b.endorsedAt ? new Date(b.endorsedAt).getTime() : 0;
        return dir * (aTime - bTime);
      }
      if (sortKey === "waiting") {
        const aDays = daysSince(a.endorsedAt) ?? -1;
        const bDays = daysSince(b.endorsedAt) ?? -1;
        return dir * (aDays - bDays);
      }
      if (sortKey === "status") {
        return dir * a.status.localeCompare(b.status);
      }
      const aFlag = cigNeedsAttention({
        isRevision: a.isRevision,
        callbackOverdueAt: a.callbackOverdueAt,
      })
        ? 0
        : 1;
      const bFlag = cigNeedsAttention({
        isRevision: b.isRevision,
        callbackOverdueAt: b.callbackOverdueAt,
      })
        ? 0
        : 1;
      if (aFlag !== bFlag) return aFlag - bFlag;
      const aTime = a.endorsedAt ? new Date(a.endorsedAt).getTime() : 0;
      const bTime = b.endorsedAt ? new Date(b.endorsedAt).getTime() : 0;
      return aTime - bTime;
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
        title="CIG verification queue"
        description="Endorsed applications awaiting verification. Callback-held files reappear when due."
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {/* Meridian verification desk strip */}
      <section className="mb-6 overflow-hidden rounded-[var(--r-lg)] border border-navy-800 bg-navy-950 text-white">
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-[1.4fr_1fr] sm:items-center">
          <div>
            <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-navy-200 opacity-80">
              Verification desk
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight">
              Clear callbacks. Re-check revisits.
            </h2>
            <p className="mt-2 max-w-md text-sm text-navy-100/80">
              Prioritize overdue callbacks and committee revisits before routine
              verification files.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[var(--r-md)] border border-navy-700 bg-navy-900/80 px-4 py-3">
              <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-navy-200 opacity-80">
                Overdue callbacks
              </p>
              <p className="mono mt-1 text-2xl font-semibold text-teal-300">
                {callbackOverdue}
              </p>
            </div>
            <div className="rounded-[var(--r-md)] border border-navy-700 bg-navy-900/80 px-4 py-3">
              <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-navy-200 opacity-80">
                Committee revisits
              </p>
              <p className="mono mt-1 text-2xl font-semibold text-teal-300">
                {revisions}
              </p>
            </div>
          </div>
        </div>
      </section>

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
            {needsAttention === 1 ? "" : "s"} need attention
            {callbackOverdue > 0
              ? ` · ${callbackOverdue} callback overdue`
              : ""}
            {revisions > 0 ? ` · ${revisions} committee revisit` : ""}
          </span>
          <span className="sp">
            <button
              type="button"
              className="text-[13px] font-semibold underline-offset-2 hover:underline"
              onClick={() =>
                setFilter(
                  callbackOverdue > 0 ? "callback_overdue" : "revisions",
                )
              }
            >
              Show urgent queue
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
          label="Revisions"
          value={revisions}
          active={workFilter === "revisions"}
          onClick={() => setFilter("revisions")}
        />
        <Kpi
          tone="warning"
          icon={IconClock}
          label="Callback overdue"
          value={callbackOverdue}
          active={workFilter === "callback_overdue"}
          onClick={() => setFilter("callback_overdue")}
        />
        <Kpi
          tone="teal"
          icon={IconCheck}
          label="Endorsed today"
          value={endorsedToday}
          active={workFilter === "endorsed_today"}
          onClick={() => setFilter("endorsed_today")}
        />
      </div>

      {applications.length === 0 ? (
        <EmptyState
          title="Queue is clear"
          description="No applications in the active queue."
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
                      <Th
                        className="sortable"
                        onClick={() => toggleSort("status")}
                      >
                        Status
                        {sortArrow("status")}
                      </Th>
                      <Th>Callback</Th>
                      <Th
                        className="sortable"
                        onClick={() => toggleSort("endorsed")}
                      >
                        Endorsed
                        {sortArrow("endorsed")}
                      </Th>
                      <Th
                        className="sortable"
                        onClick={() => toggleSort("waiting")}
                      >
                        Waiting
                        {sortArrow("waiting")}
                      </Th>
                      <Th>Next action</Th>
                      <Th className="w-1">{""}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((app) => {
                      const attention = cigNeedsAttention({
                        isRevision: app.isRevision,
                        callbackOverdueAt: app.callbackOverdueAt,
                      });
                      const waiting = daysSince(app.endorsedAt);
                      const nextAction = cigNextActionLabel({
                        isRevision: app.isRevision,
                        callbackOverdueAt: app.callbackOverdueAt,
                      });
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
                          <Td>
                            <Badge variant={statusBadgeVariant(app.status)} dot>
                              {formatStatusLabel(app.status)}
                            </Badge>
                            {app.isRevision ? (
                              <div className="mt-1">
                                <Badge variant="danger" dot>
                                  Committee revisit
                                </Badge>
                              </div>
                            ) : null}
                          </Td>
                          <Td>
                            {app.callbackOverdueAt ? (
                              <Badge variant="warning" dot>
                                Overdue{" "}
                                <span className="mono">
                                  {formatDate(app.callbackOverdueAt)}
                                </span>
                              </Badge>
                            ) : (
                              <span className="text-ink-300">—</span>
                            )}
                          </Td>
                          <Td className="mono">
                            {app.endorsedAt ? formatDate(app.endorsedAt) : "—"}
                          </Td>
                          <Td className="mono">
                            {waiting == null
                              ? "—"
                              : waiting === 0
                                ? "Today"
                                : `${waiting}d`}
                          </Td>
                          <Td className="text-[13px] text-ink-700">
                            {nextAction}
                          </Td>
                          <Td>
                            <Link href={`/cig/applications/${app.id}`}>
                              <Button variant="secondary" size="sm">
                                Verify
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
