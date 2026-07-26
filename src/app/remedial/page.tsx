"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Alert,
  Badge,
  EmptyState,
  PageHeader,
  Pagination,
  Spinner,
  Table,
  Td,
  Th,
  cn,
} from "@/components/ui";
import {
  severityLabel,
  severityRank,
  severityVariant,
  type RemedialSeverity,
} from "@/lib/remedial/desk";

type Account = {
  id: string;
  borrowerName: string;
  borrowerNo: string;
  loanAccountNo: string | null;
  outstandingBalance: number;
  agingBucket: string;
  accountStatus: string;
  daysPastDue: number;
  severity: RemedialSeverity;
  nextDueDate: string | null;
  nextDueAmount: number | null;
  turnedOverAt: string | null;
  fromCollectorName: string | null;
};

const PAGE_SIZE = 10;
type SortKey = "priority" | "balance" | "dpd" | "borrower" | "turned";
type SeverityFilter = "all" | RemedialSeverity;

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const IconAlert = (
  <svg {...iconProps}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);
const IconLayers = (
  <svg {...iconProps}>
    <path d="m12 2 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12 9 5 9-5" />
    <path d="m3 17 9 5 9-5" />
  </svg>
);
const IconCash = (
  <svg {...iconProps}>
    <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);
const IconClock = (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
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

function formatMoney(value: number) {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function RemedialQueuePage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/remedial/accounts");
      if (!res.ok) throw new Error("Failed to load remedial accounts");
      const data = (await res.json()) as { accounts: Account[] };
      setAccounts(data.accounts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const critical = accounts.filter((a) => a.severity === "critical").length;
  const elevated = accounts.filter((a) => a.severity === "elevated").length;
  const totalOutstanding = accounts.reduce(
    (sum, a) => sum + a.outstandingBalance,
    0,
  );
  const avgDpd =
    accounts.length === 0
      ? 0
      : Math.round(
          accounts.reduce((sum, a) => sum + a.daysPastDue, 0) / accounts.length,
        );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return accounts.filter((row) => {
      if (severityFilter !== "all" && row.severity !== severityFilter) {
        return false;
      }
      if (!term) return true;
      return (
        row.borrowerName.toLowerCase().includes(term) ||
        row.borrowerNo.toLowerCase().includes(term) ||
        (row.loanAccountNo?.toLowerCase().includes(term) ?? false)
      );
    });
  }, [accounts, search, severityFilter]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "balance") {
        return dir * (a.outstandingBalance - b.outstandingBalance);
      }
      if (sortKey === "dpd") {
        return dir * (a.daysPastDue - b.daysPastDue);
      }
      if (sortKey === "borrower") {
        return dir * a.borrowerName.localeCompare(b.borrowerName);
      }
      if (sortKey === "turned") {
        const at = a.turnedOverAt ?? "";
        const bt = b.turnedOverAt ?? "";
        return dir * at.localeCompare(bt);
      }
      const ar = severityRank(a.severity);
      const br = severityRank(b.severity);
      if (ar !== br) return ar - br;
      return b.outstandingBalance - a.outstandingBalance;
    });
  }, [filtered, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "borrower" ? "asc" : key === "priority" ? "asc" : "desc");
    }
    setPage(1);
  }

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="arr">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Remedial recovery"
        description="Escalated accounts at the 90-day aging threshold, turned over from collection."
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {critical > 0 ? (
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
            <span className="mono font-semibold">{critical}</span> critical
            recovery file{critical === 1 ? "" : "s"} need priority follow-up
          </span>
        </div>
      ) : null}

      <div className="kpi-grid mb-6">
        <Kpi
          tone="navy"
          icon={IconLayers}
          label="Assigned"
          value={accounts.length}
        />
        <Kpi tone="danger" icon={IconAlert} label="Critical" value={critical} />
        <Kpi
          tone="warning"
          icon={IconClock}
          label="Avg DPD"
          value={avgDpd}
        />
        <Kpi
          tone="teal"
          icon={IconCash}
          label="Outstanding"
          value={`₱${formatMoney(totalOutstanding)}`}
        />
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          title="No remedial accounts"
          description="Accounts turned over from AR/collection will appear here."
          showMark={false}
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
                placeholder="Search borrower or account"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["all", "All severity"],
                  ["critical", "Critical"],
                  ["elevated", "Elevated"],
                  ["watch", "Watch"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={cn("fchip", severityFilter === value && "on")}
                  onClick={() => {
                    setSeverityFilter(value);
                    setPage(1);
                  }}
                >
                  {label}
                  {value !== "all" && value === "elevated"
                    ? ` (${elevated})`
                    : value === "critical"
                      ? ` (${critical})`
                      : ""}
                </button>
              ))}
            </div>
          </div>

          <div className="tbl-wrap">
            <Table>
              <thead>
                <tr>
                  <Th>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1"
                      onClick={() => toggleSort("borrower")}
                    >
                      Borrower {sortArrow("borrower")}
                    </button>
                  </Th>
                  <Th>Account</Th>
                  <Th>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1"
                      onClick={() => toggleSort("priority")}
                    >
                      Severity {sortArrow("priority")}
                    </button>
                  </Th>
                  <Th num>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1"
                      onClick={() => toggleSort("balance")}
                    >
                      Outstanding {sortArrow("balance")}
                    </button>
                  </Th>
                  <Th num>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1"
                      onClick={() => toggleSort("dpd")}
                    >
                      DPD {sortArrow("dpd")}
                    </button>
                  </Th>
                  <Th>Next due</Th>
                  <Th>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1"
                      onClick={() => toggleSort("turned")}
                    >
                      Turned over {sortArrow("turned")}
                    </button>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {paged.map((acc) => (
                  <tr key={acc.id}>
                    <Td>
                      <Link
                        href={`/remedial/accounts/${acc.id}`}
                        className="font-medium text-ink-900 hover:text-teal-700"
                      >
                        {acc.borrowerName}
                      </Link>
                      <div className="mono text-xs text-ink-400">
                        {acc.borrowerNo}
                      </div>
                    </Td>
                    <Td className="mono">{acc.loanAccountNo ?? "—"}</Td>
                    <Td>
                      <Badge variant={severityVariant(acc.severity)}>
                        {severityLabel(acc.severity)}
                      </Badge>
                      <div className="mt-1">
                        <Badge variant="danger">{acc.agingBucket}</Badge>
                      </div>
                    </Td>
                    <Td num className="mono text-teal-600">
                      {formatMoney(acc.outstandingBalance)}
                    </Td>
                    <Td num className="mono">
                      {acc.daysPastDue}
                    </Td>
                    <Td>
                      {acc.nextDueDate ? (
                        <span className="text-sm">
                          <span className="mono">
                            {formatDate(acc.nextDueDate)}
                          </span>
                          {acc.nextDueAmount != null ? (
                            <span className="text-ink-500">
                              {" · "}₱{formatMoney(acc.nextDueAmount)}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </Td>
                    <Td>
                      <div className="text-sm">
                        {acc.turnedOverAt
                          ? formatDate(acc.turnedOverAt)
                          : "—"}
                      </div>
                      {acc.fromCollectorName ? (
                        <div className="text-xs text-ink-400">
                          from {acc.fromCollectorName}
                        </div>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>

          {sorted.length > PAGE_SIZE ? (
            <Pagination
              page={safePage}
              pageCount={pageCount}
              onPageChange={setPage}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
