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
import { formatDate } from "@/lib/cig/format";
import {
  cigRecentMatchesFinding,
  cigRecentMatchesSearch,
  cigRecentMatchesStatus,
  type CigRecentFindingFilter,
} from "@/lib/cig/history";

type RecentVerification = {
  id: string;
  applicationNo: string | null;
  status: string;
  finding: "positive" | "negative" | null;
  forwardedAt: string | null;
  completedAt: string | null;
  borrower: {
    borrowerNo: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
};

const HISTORY_PAGE_SIZE = 10;

const FINDING_CHIPS: Array<{ id: CigRecentFindingFilter; label: string }> = [
  { id: "all", label: "All findings" },
  { id: "positive", label: "Positive" },
  { id: "negative", label: "Negative" },
];

export default function CigHistoryPage() {
  const [recent, setRecent] = useState<RecentVerification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentSearch, setRecentSearch] = useState("");
  const [recentFinding, setRecentFinding] =
    useState<CigRecentFindingFilter>("all");
  const [recentStatus, setRecentStatus] = useState("all");
  const [recentPage, setRecentPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cig/history");
      if (!res.ok) throw new Error("Failed to load recent verifications");
      const data = (await res.json()) as { recent: RecentVerification[] };
      setRecent(data.recent ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const recentStatusOptions = useMemo(() => {
    const statuses = [...new Set(recent.map((item) => item.status))].sort();
    return statuses;
  }, [recent]);

  const filteredRecent = useMemo(() => {
    return recent.filter(
      (item) =>
        cigRecentMatchesSearch(item, recentSearch) &&
        cigRecentMatchesFinding(item.finding, recentFinding) &&
        cigRecentMatchesStatus(item.status, recentStatus),
    );
  }, [recent, recentSearch, recentFinding, recentStatus]);

  const recentPageCount = Math.max(
    1,
    Math.ceil(filteredRecent.length / HISTORY_PAGE_SIZE),
  );
  const safeRecentPage = Math.min(recentPage, recentPageCount);
  const pagedRecent = filteredRecent.slice(
    (safeRecentPage - 1) * HISTORY_PAGE_SIZE,
    safeRecentPage * HISTORY_PAGE_SIZE,
  );

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Recent verifications"
        description="Files already forwarded to Committee. Read-only desk history."
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="rounded-[var(--r-lg)] border border-line-soft bg-surface-2/50 p-4 sm:p-5">
        {recent.length > 0 ? (
          <div className="mb-3.5 flex flex-wrap items-end justify-between gap-2">
            <p className="text-[12px] text-ink-400">
              {filteredRecent.length} of {recent.length}
            </p>
          </div>
        ) : null}

        {recent.length > 0 ? (
          <>
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
                  value={recentSearch}
                  onChange={(e) => {
                    setRecentSearch(e.target.value);
                    setRecentPage(1);
                  }}
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {FINDING_CHIPS.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    className={cn(
                      "fchip",
                      recentFinding === chip.id && "is-on",
                    )}
                    onClick={() => {
                      setRecentFinding(chip.id);
                      setRecentPage(1);
                    }}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className={cn("fchip", recentStatus === "all" && "is-on")}
                  onClick={() => {
                    setRecentStatus("all");
                    setRecentPage(1);
                  }}
                >
                  All statuses
                </button>
                {recentStatusOptions.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={cn(
                      "fchip",
                      recentStatus === status && "is-on",
                    )}
                    onClick={() => {
                      setRecentStatus(status);
                      setRecentPage(1);
                    }}
                  >
                    {formatStatusLabel(status)}
                  </button>
                ))}
              </div>
            </div>

            {filteredRecent.length > 0 ? (
              <>
                <div className="tbl-wrap">
                  <Table>
                    <thead>
                      <tr>
                        <Th>Borrower</Th>
                        <Th>Finding</Th>
                        <Th>Forwarded</Th>
                        <Th>Status</Th>
                        <Th className="w-1">{""}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedRecent.map((item) => (
                        <tr key={item.id}>
                          <Td>
                            <div className="font-medium text-ink-900">
                              {item.borrower
                                ? `${item.borrower.firstName} ${item.borrower.lastName}`
                                : "Unknown borrower"}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-ink-400">
                              <span className="id">
                                {item.applicationNo ??
                                  item.borrower?.borrowerNo ??
                                  item.id.slice(0, 8)}
                              </span>
                              {item.borrower?.email ? (
                                <span className="truncate">
                                  {item.borrower.email}
                                </span>
                              ) : null}
                            </div>
                          </Td>
                          <Td>
                            {item.finding ? (
                              <Badge
                                variant={
                                  item.finding === "positive"
                                    ? "success"
                                    : "danger"
                                }
                                dot
                              >
                                {item.finding === "positive"
                                  ? "Positive"
                                  : "Negative"}
                              </Badge>
                            ) : (
                              <span className="text-ink-300">—</span>
                            )}
                          </Td>
                          <Td className="mono">
                            {item.forwardedAt
                              ? formatDate(item.forwardedAt)
                              : "—"}
                          </Td>
                          <Td>
                            <Badge
                              variant={statusBadgeVariant(item.status)}
                              dot
                            >
                              {formatStatusLabel(item.status)}
                            </Badge>
                          </Td>
                          <Td>
                            <Link href={`/cig/applications/${item.id}`}>
                              <Button variant="secondary" size="sm">
                                View
                              </Button>
                            </Link>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
                <div className="mt-4">
                  <Pagination
                    page={safeRecentPage}
                    pageCount={recentPageCount}
                    onPageChange={setRecentPage}
                    summary={`Showing ${
                      pagedRecent.length
                        ? (safeRecentPage - 1) * HISTORY_PAGE_SIZE + 1
                        : 0
                    }–${
                      (safeRecentPage - 1) * HISTORY_PAGE_SIZE +
                      pagedRecent.length
                    } of ${filteredRecent.length}`}
                  />
                </div>
              </>
            ) : (
              <EmptyState
                title="No matching verifications"
                description="Try a different search term or filter."
                showMark={false}
              />
            )}
          </>
        ) : (
          <EmptyState
            title="No forwarded files yet"
            description="Completed verifications will appear here after they go to Committee."
            showMark={false}
          />
        )}
      </div>
    </div>
  );
}
