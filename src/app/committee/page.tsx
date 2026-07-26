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
import { tatTone } from "@/lib/committee/votes";

type CommitteeItem = {
  id: string;
  applicationNo: string | null;
  status: string;
  isReloan: boolean;
  createdAt: string;
  updatedAt: string;
  borrower: {
    borrowerNo: string;
    firstName: string;
    lastName: string;
  } | null;
  verification: {
    finding: "positive" | "negative" | null;
    forwardedAt: string | null;
    completedAt: string | null;
  } | null;
  tatDays: number | null;
};

const PAGE_SIZE = 10;

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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
const IconGavel = (
  <svg {...iconProps}>
    <path d="m14 13-7.5 7.5a1 1 0 0 1-3-3L11 10" />
    <path d="m16 16 6-6" />
    <path d="m8 8 6-6" />
    <path d="m9 7 8 8" />
    <path d="m21 11-8-8" />
  </svg>
);
const IconHandshake = (
  <svg {...iconProps}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
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
  danger: { background: "var(--danger-bg)", color: "var(--danger)" },
  warning: { background: "var(--warning-bg)", color: "var(--warning)" },
  teal: { background: "var(--teal-50)", color: "var(--teal-700)" },
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

type SortKey = "priority" | "tat" | "forwarded" | "status";

export default function CommitteeDashboardPage() {
  const [applications, setApplications] = useState<CommitteeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/committee/applications");
      if (!res.ok) throw new Error("Failed to load queue");
      const data = (await res.json()) as { applications: CommitteeItem[] };
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

  if (loading) return <Spinner />;

  const total = applications.length;
  const needsDecision = applications.filter(
    (a) => a.status === "for_approval",
  ).length;
  const onCommitteeHold = applications.filter(
    (a) => a.status === "committee_hold",
  ).length;
  const inNegotiation = applications.filter(
    (a) => a.status === "negotiating_terms",
  ).length;
  const tatOverdue = applications.filter(
    (a) => a.tatDays != null && a.tatDays >= 5,
  ).length;

  const statusOptions = Array.from(
    new Set(applications.map((a) => a.status)),
  ).map((status) => ({ value: status, label: formatStatusLabel(status) }));

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "tat" ? "desc" : "asc");
    }
    setPage(1);
  }

  const term = search.trim().toLowerCase();
  const filtered = applications.filter((app) => {
    const matchesStatus = statusFilter === "all" || app.status === statusFilter;
    if (!matchesStatus) return false;
    if (!term) return true;
    const name = app.borrower
      ? `${app.borrower.firstName} ${app.borrower.lastName}`.toLowerCase()
      : "";
    return (
      name.includes(term) ||
      (app.borrower?.borrowerNo.toLowerCase().includes(term) ?? false) ||
      (app.applicationNo?.toLowerCase().includes(term) ?? false)
    );
  });

  const dir = sortDir === "asc" ? 1 : -1;
  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === "tat") {
      return dir * ((a.tatDays ?? -1) - (b.tatDays ?? -1));
    }
    if (sortKey === "forwarded") {
      const aTime = a.verification?.forwardedAt
        ? new Date(a.verification.forwardedAt).getTime()
        : 0;
      const bTime = b.verification?.forwardedAt
        ? new Date(b.verification.forwardedAt).getTime()
        : 0;
      return dir * (aTime - bTime);
    }
    if (sortKey === "status") {
      return dir * a.status.localeCompare(b.status);
    }
    // priority: TAT overdue and negative findings float to the top, then oldest-forwarded first
    const aFlag =
      (a.tatDays != null && a.tatDays >= 5) || a.verification?.finding === "negative"
        ? 0
        : 1;
    const bFlag =
      (b.tatDays != null && b.tatDays >= 5) || b.verification?.finding === "negative"
        ? 0
        : 1;
    if (aFlag !== bFlag) return aFlag - bFlag;
    const aTime = a.verification?.forwardedAt
      ? new Date(a.verification.forwardedAt).getTime()
      : 0;
    const bTime = b.verification?.forwardedAt
      ? new Date(b.verification.forwardedAt).getTime()
      : 0;
    return aTime - bTime;
  });

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="arr">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  return (
    <div>
      <PageHeader
        title="Committee queue"
        description="Applications auto-forwarded from CIG after verification is complete."
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="kpi-grid mb-6">
        <Kpi tone="navy" icon={IconLayers} label="In queue" value={total} />
        <Kpi
          tone="teal"
          icon={IconGavel}
          label="Needs decision"
          value={needsDecision}
        />
        <Kpi
          tone="danger"
          icon={IconClock}
          label="On hold"
          value={onCommitteeHold}
        />
        <Kpi
          tone="navy"
          icon={IconHandshake}
          label="In negotiation"
          value={inNegotiation}
        />
        <Kpi
          tone="danger"
          icon={IconClock}
          label="TAT overdue (5d+)"
          value={tatOverdue}
        />
      </div>

      {applications.length === 0 ? (
        <EmptyState
          title="Queue is clear"
          description="No files pending committee decision."
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
                  className={cn("fchip", statusFilter !== "all" && "is-on")}
                >
                  {statusFilter === "all" ? (
                    <>
                      Filter
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
                    <Th>Application</Th>
                    <Th
                      className="sortable"
                      onClick={() => toggleSort("status")}
                    >
                      Status
                      {sortArrow("status")}
                    </Th>
                    <Th>CIG finding</Th>
                    <Th
                      className="sortable"
                      onClick={() => toggleSort("tat")}
                    >
                      TAT
                      {sortArrow("tat")}
                    </Th>
                    <Th
                      className="sortable"
                      onClick={() => toggleSort("forwarded")}
                    >
                      Forwarded
                      {sortArrow("forwarded")}
                    </Th>
                    <Th className="w-1">{""}</Th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((app) => (
                    <tr key={app.id}>
                      <Td>
                        <div className="font-medium text-ink-900">
                          {app.borrower
                            ? `${app.borrower.firstName} ${app.borrower.lastName}`
                            : "Unknown borrower"}
                        </div>
                        <span className="id">
                          {app.applicationNo ??
                            app.borrower?.borrowerNo ??
                            app.id.slice(0, 8)}
                          {app.isReloan ? " · Reloan" : ""}
                        </span>
                      </Td>
                      <Td>
                        <Badge variant={statusBadgeVariant(app.status)} dot>
                          {formatStatusLabel(app.status)}
                        </Badge>
                      </Td>
                      <Td>
                        {app.verification?.finding ? (
                          <Badge
                            variant={
                              app.verification.finding === "positive"
                                ? "success"
                                : "danger"
                            }
                          >
                            {app.verification.finding === "positive"
                              ? "Positive"
                              : "Negative"}
                          </Badge>
                        ) : (
                          <Badge variant="neutral">Pending</Badge>
                        )}
                      </Td>
                      <Td>
                        {app.tatDays != null ? (
                          <Badge variant={tatTone(app.tatDays)} dot>
                            <span className="mono">{app.tatDays}d</span>
                          </Badge>
                        ) : (
                          <span className="text-ink-300">—</span>
                        )}
                      </Td>
                      <Td className="mono">
                        {app.verification?.forwardedAt
                          ? formatDate(app.verification.forwardedAt)
                          : "—"}
                      </Td>
                      <Td>
                        <Link href={`/committee/applications/${app.id}`}>
                          <Button variant="secondary" size="sm">
                            Review
                          </Button>
                        </Link>
                      </Td>
                    </tr>
                  ))}
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
              title="No matching applications"
              description="Try a different search term or status filter."
              showMark={false}
            />
          )}
        </div>
      )}
    </div>
  );
}
