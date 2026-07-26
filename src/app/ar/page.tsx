"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  Badge,
  Button,
  Card,
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

type PortfolioJoin = {
  name: string;
  investor_label: string | null;
};

type AssignmentJoin = {
  collector_user_id: string | null;
  remedial_user_id: string | null;
};

type MasterlistRow = {
  id: string;
  loan_account_no: string | null;
  borrower_name: string;
  borrower_no: string;
  outstanding_balance: number;
  aging_bucket: string;
  account_status: string;
  monthly_amortization: number;
  remedial_flag?: boolean | null;
  portfolios?: PortfolioJoin | PortfolioJoin[] | null;
  assignments?: AssignmentJoin | AssignmentJoin[] | null;
};

type QueueRow = {
  id: string;
  loan_application_id: string;
  queued_at: string;
  loan_applications?:
    | {
        application_no: string | null;
        status: string;
        borrowers?:
          | {
              borrower_no: string;
              first_name: string;
              last_name: string;
            }
          | Array<{
              borrower_no: string;
              first_name: string;
              last_name: string;
            }>
          | null;
      }
    | Array<{
        application_no: string | null;
        status: string;
        borrowers?:
          | { borrower_no: string; first_name: string; last_name: string }
          | Array<{ borrower_no: string; first_name: string; last_name: string }>
          | null;
      }>
    | null;
};

const PAGE_SIZE = 10;

function formatMoney(value: number) {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function accountStatusVariant(
  status: string,
): "success" | "warning" | "danger" | "neutral" | "teal" {
  const s = status.toLowerCase();
  if (s === "active" || s === "current") return "success";
  if (s === "paid_off") return "teal";
  if (s === "overdue" || s === "delinquent" || s === "past_due" || s === "remedial")
    return "danger";
  return "neutral";
}

function agingBucketVariant(
  bucket: string,
): "success" | "warning" | "danger" | "neutral" {
  const b = bucket.toLowerCase();
  if (b === "current") return "success";
  if (b.includes("91") || b.includes("120") || b.includes("180")) return "danger";
  if (b.includes("dpd") || b.includes("day") || b.includes("30") || b.includes("60"))
    return "warning";
  return "neutral";
}

function firstJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function needsAttention(row: MasterlistRow) {
  if (row.remedial_flag) return true;
  const bucket = row.aging_bucket.toLowerCase();
  return bucket !== "current" && bucket !== "";
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
const IconCheck = (
  <svg {...iconProps}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <path d="m9 11 3 3L22 4" />
  </svg>
);
const IconAlert = (
  <svg {...iconProps}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);
const IconCash = (
  <svg {...iconProps}>
    <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

const KPI_TONES = {
  navy: { background: "var(--navy-50)", color: "var(--navy-700)" },
  success: { background: "var(--success-bg)", color: "var(--success)" },
  danger: { background: "var(--danger-bg)", color: "var(--danger)" },
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
  value: string | number;
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

type SortKey = "priority" | "balance" | "borrower" | "status";

export default function ArDashboardPage() {
  const [masterlist, setMasterlist] = useState<MasterlistRow[]>([]);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [receiving, setReceiving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [agingFilter, setAgingFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mlRes, qRes] = await Promise.all([
        fetch("/api/ar/masterlist"),
        fetch("/api/ar/queue"),
      ]);
      if (!mlRes.ok || !qRes.ok) throw new Error("Failed to load");
      const mlData = (await mlRes.json()) as { masterlist: MasterlistRow[] };
      const qData = (await qRes.json()) as { queue: QueueRow[] };
      setMasterlist(mlData.masterlist);
      setQueue(qData.queue);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function receiveFile(applicationId: string) {
    setReceiving(applicationId);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/ar/queue/${applicationId}/receive`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to receive file");
      }
      setMessage("File received — masterlist account created, loan is active.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setReceiving(null);
    }
  }

  async function exportCsv() {
    const res = await fetch("/api/ar/masterlist", { method: "POST" });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "masterlist-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <Spinner />;

  const total = masterlist.length;
  const activeCount = masterlist.filter(
    (r) => r.account_status.toLowerCase() === "active",
  ).length;
  const attentionCount = masterlist.filter(needsAttention).length;
  const totalOutstanding = masterlist.reduce(
    (sum, r) => sum + Number(r.outstanding_balance ?? 0),
    0,
  );

  const statusOptions = Array.from(
    new Set(masterlist.map((r) => r.account_status).filter(Boolean)),
  ).map((status) => ({ value: status, label: status }));

  const agingOptions = Array.from(
    new Set(masterlist.map((r) => r.aging_bucket).filter(Boolean)),
  ).map((bucket) => ({ value: bucket, label: bucket }));

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "borrower" ? "asc" : "desc");
    }
    setPage(1);
  }

  const term = search.trim().toLowerCase();
  const filtered = masterlist.filter((row) => {
    if (statusFilter !== "all" && row.account_status !== statusFilter) {
      return false;
    }
    if (agingFilter !== "all" && row.aging_bucket !== agingFilter) {
      return false;
    }
    if (!term) return true;
    return (
      row.borrower_name.toLowerCase().includes(term) ||
      row.borrower_no.toLowerCase().includes(term) ||
      (row.loan_account_no?.toLowerCase().includes(term) ?? false)
    );
  });

  const dir = sortDir === "asc" ? 1 : -1;
  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === "balance") {
      return (
        dir *
        (Number(a.outstanding_balance) - Number(b.outstanding_balance))
      );
    }
    if (sortKey === "borrower") {
      return dir * a.borrower_name.localeCompare(b.borrower_name);
    }
    if (sortKey === "status") {
      return dir * a.account_status.localeCompare(b.account_status);
    }
    // priority: attention first, then highest outstanding
    const aFlag = needsAttention(a) ? 0 : 1;
    const bFlag = needsAttention(b) ? 0 : 1;
    if (aFlag !== bFlag) return aFlag - bFlag;
    return Number(b.outstanding_balance) - Number(a.outstanding_balance);
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
        title="AR masterlist"
        description="Post-release accounts, portfolio assignment, and export."
        actions={
          <Button variant="secondary" onClick={() => void exportCsv()}>
            Export CSV
          </Button>
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {message ? (
        <div className="mb-4">
          <Alert variant="success">{message}</Alert>
        </div>
      ) : null}

      {queue.length > 0 ? (
        <Card className="mb-6">
          <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
            Receive queue
          </h2>
          <p className="mb-3 text-sm text-ink-500">
            Closed files transmitted by LRA — receiving a file creates its
            masterlist account and amortization schedule.
          </p>
          <Table>
            <thead>
              <tr>
                <Th>Borrower</Th>
                <Th>Queued</Th>
                <Th className="w-1">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {queue.map((row) => {
                const appRaw = row.loan_applications;
                const app = Array.isArray(appRaw) ? appRaw[0] : appRaw;
                const borrowerRaw = app?.borrowers;
                const borrower = Array.isArray(borrowerRaw)
                  ? borrowerRaw[0]
                  : borrowerRaw;
                return (
                  <tr key={row.id}>
                    <Td>
                      <div className="font-medium text-ink-900">
                        {borrower
                          ? `${borrower.first_name} ${borrower.last_name}`
                          : "Unknown borrower"}
                      </div>
                      <span className="id">
                        {app?.application_no ??
                          borrower?.borrower_no ??
                          row.loan_application_id.slice(0, 8)}
                      </span>
                    </Td>
                    <Td className="mono">
                      {new Date(row.queued_at).toLocaleString("en-PH", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Td>
                    <Td>
                      <Button
                        size="sm"
                        loading={receiving === row.loan_application_id}
                        onClick={() =>
                          void receiveFile(row.loan_application_id)
                        }
                      >
                        Receive &amp; create account
                      </Button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      ) : null}

      <div className="kpi-grid mb-6">
        <Kpi tone="navy" icon={IconLayers} label="Accounts" value={total} />
        <Kpi tone="success" icon={IconCheck} label="Active" value={activeCount} />
        <Kpi
          tone="danger"
          icon={IconAlert}
          label="Needs attention"
          value={attentionCount}
        />
        <Kpi
          tone="teal"
          icon={IconCash}
          label="Outstanding"
          value={`₱${formatMoney(totalOutstanding)}`}
        />
      </div>

      {masterlist.length === 0 ? (
        <EmptyState
          title="No masterlist records"
          description="Closed files will appear here after release processing."
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
                placeholder="Search name, borrower no, account"
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
                      Status: <b>{statusFilter}</b>
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

            <DropdownMenu
              trigger={
                <span
                  className={cn("fchip", agingFilter !== "all" && "is-on")}
                >
                  {agingFilter === "all" ? (
                    <>
                      Aging
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
                      Aging: <b>{agingFilter}</b>
                      <span
                        className="x"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAgingFilter("all");
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
                  label: "All aging",
                  onClick: () => {
                    setAgingFilter("all");
                    setPage(1);
                  },
                },
                ...agingOptions.map((opt) => ({
                  label: opt.label,
                  onClick: () => {
                    setAgingFilter(opt.value);
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
                    <Th
                      className="sortable"
                      onClick={() => toggleSort("borrower")}
                    >
                      Borrower
                      {sortArrow("borrower")}
                    </Th>
                    <Th>Loan account</Th>
                    <Th>Portfolio</Th>
                    <Th
                      className="num sortable"
                      onClick={() => toggleSort("balance")}
                    >
                      Outstanding
                      {sortArrow("balance")}
                    </Th>
                    <Th className="num">Monthly</Th>
                    <Th>Aging</Th>
                    <Th
                      className="sortable"
                      onClick={() => toggleSort("status")}
                    >
                      Status
                      {sortArrow("status")}
                    </Th>
                    <Th>Assignment</Th>
                    <Th className="w-1">{""}</Th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((row) => {
                    const portfolio = firstJoin(row.portfolios);
                    const assignment = firstJoin(row.assignments);
                    const assigned = Boolean(
                      assignment?.collector_user_id ||
                        assignment?.remedial_user_id,
                    );
                    return (
                      <tr key={row.id}>
                        <Td>
                          <div className="font-medium text-ink-900">
                            {row.borrower_name}
                          </div>
                          <span className="id">{row.borrower_no}</span>
                        </Td>
                        <Td>
                          <span className="id">
                            {row.loan_account_no ?? "—"}
                          </span>
                        </Td>
                        <Td>{portfolio?.name ?? "—"}</Td>
                        <Td className="num text-teal-600">
                          {formatMoney(Number(row.outstanding_balance))}
                        </Td>
                        <Td className="num">
                          {formatMoney(Number(row.monthly_amortization))}
                        </Td>
                        <Td>
                          <Badge
                            variant={agingBucketVariant(row.aging_bucket)}
                            dot
                          >
                            {row.aging_bucket}
                          </Badge>
                        </Td>
                        <Td>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge
                              variant={accountStatusVariant(row.account_status)}
                              dot
                            >
                              {row.account_status}
                            </Badge>
                            {row.remedial_flag ? (
                              <Badge variant="danger" dot>
                                Remedial
                              </Badge>
                            ) : null}
                          </div>
                        </Td>
                        <Td>
                          <Badge
                            variant={assigned ? "teal" : "warning"}
                            dot
                          >
                            {assigned ? "Assigned" : "Unassigned"}
                          </Badge>
                        </Td>
                        <Td>
                          <Link href={`/ar/masterlist/${row.id}`}>
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
              title="No matching accounts"
              description="Try a different search, status, or aging filter."
              showMark={false}
            />
          )}
        </div>
      )}
    </div>
  );
}
