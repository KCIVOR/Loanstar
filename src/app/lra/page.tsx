"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  Badge,
  Button,
  cn,
  DropdownMenu,
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
  isCompletedLraQueueItem,
  lraQueueBucket,
} from "@/lib/lra/queue-classify";

type QueueItem = {
  applicationId: string;
  queuedAt: string;
  application: {
    applicationNo: string | null;
    status: string;
    blocker: string | null;
    updatedAt?: string;
  } | null;
  borrower: {
    borrowerNo: string;
    firstName: string;
    lastName: string;
  } | null;
  releaseFile: {
    status: string;
    releasePath: string | null;
  } | null;
};

const PAGE_SIZE = 10;

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function classifyInput(item: QueueItem) {
  return {
    applicationStatus: item.application?.status,
    blocker: item.application?.blocker,
    releaseFileStatus: item.releaseFile?.status,
  };
}

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const IconLayers = (
  <svg {...iconProps}>
    <path d="m12 2 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12 9 5 9-5" />
    <path d="m3 17 9 5 9-5" />
  </svg>
);
const IconWrench = (
  <svg {...iconProps}>
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z" />
  </svg>
);
const IconUser = (
  <svg {...iconProps}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
  </svg>
);
const IconCheck = (
  <svg {...iconProps}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <path d="m9 11 3 3L22 4" />
  </svg>
);

const KPI_TONES = {
  navy: { background: "var(--navy-50)", color: "var(--navy-700)" },
  warning: { background: "var(--warning-bg)", color: "var(--warning)" },
  teal: { background: "var(--teal-50)", color: "var(--teal-700)" },
  success: { background: "var(--success-bg)", color: "var(--success)" },
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
  value: number;
}) {
  return (
    <div className="kpi flex h-full flex-col">
      <span className="ic" style={KPI_TONES[tone]}>
        {icon}
      </span>
      <div className="k">{label}</div>
      <div className="v">{value}</div>
    </div>
  );
}

type SortKey = "priority" | "queued" | "status";
type ScopeFilter = "active" | "all" | "completed";

export default function LraDashboardPage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("active");
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/lra/queue");
      if (!res.ok) throw new Error("Failed to load queue");
      const data = (await res.json()) as { queue: QueueItem[] };
      setQueue(data.queue);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Spinner />;

  const active = queue.filter((item) => !isCompletedLraQueueItem(classifyInput(item)));
  const setupCount = active.filter(
    (item) => lraQueueBucket(classifyInput(item)) === "setup",
  ).length;
  const briefingCount = active.filter(
    (item) => lraQueueBucket(classifyInput(item)) === "briefing",
  ).length;
  const readyCount = active.filter(
    (item) => lraQueueBucket(classifyInput(item)) === "ready",
  ).length;

  const statusOptions = Array.from(
    new Set(
      queue
        .map((item) => item.application?.status)
        .filter((status): status is string => Boolean(status)),
    ),
  ).map((status) => ({ value: status, label: formatStatusLabel(status) }));

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "queued" ? "asc" : "asc");
    }
    setPage(1);
  }

  const term = search.trim().toLowerCase();
  const filtered = queue.filter((item) => {
    const completed = isCompletedLraQueueItem(classifyInput(item));
    if (scopeFilter === "active" && completed) return false;
    if (scopeFilter === "completed" && !completed) return false;

    const status = item.application?.status ?? "";
    if (statusFilter !== "all" && status !== statusFilter) return false;

    if (!term) return true;
    const name = item.borrower
      ? `${item.borrower.firstName} ${item.borrower.lastName}`.toLowerCase()
      : "";
    return (
      name.includes(term) ||
      (item.borrower?.borrowerNo.toLowerCase().includes(term) ?? false) ||
      (item.application?.applicationNo?.toLowerCase().includes(term) ?? false)
    );
  });

  const bucketRank: Record<string, number> = {
    ready: 0,
    setup: 1,
    briefing: 2,
    other: 3,
    completed: 4,
  };

  const dir = sortDir === "asc" ? 1 : -1;
  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === "queued") {
      return (
        dir * (new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime())
      );
    }
    if (sortKey === "status") {
      return (
        dir *
        (a.application?.status ?? "").localeCompare(b.application?.status ?? "")
      );
    }
    // priority: ready → setup → briefing, then oldest queued (FIFO)
    const aBucket = lraQueueBucket(classifyInput(a));
    const bBucket = lraQueueBucket(classifyInput(b));
    const aRank = bucketRank[aBucket] ?? 3;
    const bRank = bucketRank[bBucket] ?? 3;
    if (aRank !== bRank) return aRank - bRank;
    return new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime();
  });

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="arr">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  const scopeLabel =
    scopeFilter === "active"
      ? "Active"
      : scopeFilter === "completed"
        ? "Completed"
        : "All";

  return (
    <div>
      <PageHeader
        title="LRA release queue"
        description="Files with signed computation ready for documentation and release."
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="kpi-grid mb-6">
        <Kpi
          tone="navy"
          icon={IconLayers}
          label="Active in queue"
          value={active.length}
        />
        <Kpi
          tone="warning"
          icon={IconWrench}
          label="Setup / encoding"
          value={setupCount}
        />
        <Kpi
          tone="teal"
          icon={IconUser}
          label="Awaiting briefing"
          value={briefingCount}
        />
        <Kpi
          tone="success"
          icon={IconCheck}
          label="Ready to release"
          value={readyCount}
        />
      </div>

      {queue.length === 0 ? (
        <EmptyState
          title="Queue is clear"
          description="No files pending LRA processing."
        />
      ) : (
        <div className="flex flex-col gap-3.5">
          <div className="tbl-toolbar">
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
                placeholder="Search borrower or application no."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            <DropdownMenu
              trigger={
                <span
                  className={cn("fchip", scopeFilter !== "active" && "is-on")}
                >
                  Scope: <b>{scopeLabel}</b>
                  {scopeFilter !== "active" ? (
                    <span
                      className="x"
                      onClick={(e) => {
                        e.stopPropagation();
                        setScopeFilter("active");
                        setPage(1);
                      }}
                    >
                      ×
                    </span>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  )}
                </span>
              }
              items={[
                {
                  label: "Active only",
                  onClick: () => {
                    setScopeFilter("active");
                    setPage(1);
                  },
                },
                {
                  label: "Completed",
                  onClick: () => {
                    setScopeFilter("completed");
                    setPage(1);
                  },
                },
                {
                  label: "All queue rows",
                  onClick: () => {
                    setScopeFilter("all");
                    setPage(1);
                  },
                },
              ]}
            />

            <DropdownMenu
              trigger={
                <span
                  className={cn("fchip", statusFilter !== "all" && "is-on")}
                >
                  {statusFilter === "all" ? (
                    <>
                      Status
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M22 3H2l8 9.46V19l4 2v-8.54Z" />
                      </svg>
                    </>
                  ) : (
                    <>
                      Status: <b>{formatStatusLabel(statusFilter)}</b>
                      <span
                        className="x"
                        onClick={(e) => {
                          e.stopPropagation();
                          setStatusFilter("all");
                          setPage(1);
                        }}
                      >
                        ×
                      </span>
                    </>
                  )}
                </span>
              }
              items={[
                {
                  label: "All statuses",
                  onClick: () => {
                    setStatusFilter("all");
                    setPage(1);
                  },
                },
                ...statusOptions.map((opt) => ({
                  label: opt.label,
                  onClick: () => {
                    setStatusFilter(opt.value);
                    setPage(1);
                  },
                })),
              ]}
            />
          </div>

          {sorted.length ? (
            <>
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
                    <Th>Stage / blocker</Th>
                    <Th>Path</Th>
                    <Th
                      className="sortable"
                      onClick={() => toggleSort("queued")}
                    >
                      Queued
                      {sortArrow("queued")}
                    </Th>
                    <Th className="w-1">{""}</Th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((item) => {
                    const path = item.releaseFile?.releasePath;
                    return (
                      <tr key={item.applicationId}>
                        <Td>
                          <div className="font-medium text-ink-900">
                            {item.borrower
                              ? `${item.borrower.firstName} ${item.borrower.lastName}`
                              : "Unknown borrower"}
                          </div>
                          <span className="id">
                            {item.application?.applicationNo ??
                              item.borrower?.borrowerNo ??
                              item.applicationId.slice(0, 8)}
                          </span>
                        </Td>
                        <Td>
                          {item.application ? (
                            <Badge
                              variant={statusBadgeVariant(
                                item.application.status,
                              )}
                              dot
                            >
                              {formatStatusLabel(item.application.status)}
                            </Badge>
                          ) : (
                            <span className="text-ink-300">—</span>
                          )}
                        </Td>
                        <Td>
                          {item.application?.blocker ? (
                            <Badge
                              variant={
                                isCompletedLraQueueItem(classifyInput(item))
                                  ? "success"
                                  : lraQueueBucket(classifyInput(item)) ===
                                      "ready"
                                    ? "teal"
                                    : "warning"
                              }
                              dot
                            >
                              {item.application.blocker}
                            </Badge>
                          ) : (
                            <span className="text-ink-300">—</span>
                          )}
                        </Td>
                        <Td>
                          {path === "with_pdc"
                            ? "With PDC"
                            : path === "without_pdc"
                              ? "Without PDC"
                              : "—"}
                        </Td>
                        <Td className="mono">
                          {formatDateTime(item.queuedAt)}
                        </Td>
                        <Td>
                          <Link
                            href={`/lra/applications/${item.applicationId}`}
                          >
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

              <Pagination
                page={safePage}
                pageCount={pageCount}
                onPageChange={setPage}
                summary={`Showing ${paged.length ? (safePage - 1) * PAGE_SIZE + 1 : 0}–${
                  (safePage - 1) * PAGE_SIZE + paged.length
                } of ${sorted.length}`}
              />
            </>
          ) : (
            <EmptyState
              title="No matching files"
              description="Try a different search, scope, or status filter."
              showMark={false}
            />
          )}
        </div>
      )}
    </div>
  );
}
