"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Alert,
  Button,
  EmptyState,
  PageHeader,
  Pagination,
  Spinner,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { formatDateTime } from "@/lib/cig/format";
import { cigRecentMatchesSearch } from "@/lib/cig/history";

type ScheduledCallback = {
  id: string;
  applicationId: string;
  applicationNo: string | null;
  scheduledAt: string;
  notes: string | null;
  borrower: {
    borrowerNo: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
};

const CALLBACK_PAGE_SIZE = 5;

export default function CigCallbacksPage() {
  const [scheduledCallbacks, setScheduledCallbacks] = useState<
    ScheduledCallback[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [callbackSearch, setCallbackSearch] = useState("");
  const [callbackPage, setCallbackPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cig/callbacks");
      if (!res.ok) throw new Error("Failed to load scheduled callbacks");
      const data = (await res.json()) as {
        scheduledCallbacks: ScheduledCallback[];
      };
      setScheduledCallbacks(data.scheduledCallbacks ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredCallbacks = useMemo(() => {
    return scheduledCallbacks.filter((cb) =>
      cigRecentMatchesSearch(
        {
          applicationNo: cb.applicationNo,
          borrower: cb.borrower,
        },
        callbackSearch,
      ),
    );
  }, [scheduledCallbacks, callbackSearch]);

  const callbackPageCount = Math.max(
    1,
    Math.ceil(filteredCallbacks.length / CALLBACK_PAGE_SIZE),
  );
  const safeCallbackPage = Math.min(callbackPage, callbackPageCount);
  const pagedCallbacks = filteredCallbacks.slice(
    (safeCallbackPage - 1) * CALLBACK_PAGE_SIZE,
    safeCallbackPage * CALLBACK_PAGE_SIZE,
  );

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Scheduled callbacks"
        description="Held out of the active queue until the follow-up date. They reappear automatically when due."
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {scheduledCallbacks.length === 0 ? (
        <EmptyState
          title="No scheduled callbacks"
          description="Callbacks held out of the active queue will appear here until their follow-up date."
        />
      ) : (
        <div className="rounded-[var(--r-lg)] border border-line-soft bg-surface-2/50 p-4 sm:p-5">
          <div className="mb-3.5 flex flex-wrap items-end justify-between gap-2">
            <p className="text-[12px] text-ink-400">
              {filteredCallbacks.length} of {scheduledCallbacks.length}
            </p>
          </div>

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
                value={callbackSearch}
                onChange={(e) => {
                  setCallbackSearch(e.target.value);
                  setCallbackPage(1);
                }}
              />
            </div>
          </div>

          {filteredCallbacks.length > 0 ? (
            <>
              <div className="tbl-wrap">
                <Table>
                  <thead>
                    <tr>
                      <Th>Borrower</Th>
                      <Th>Due</Th>
                      <Th>Notes</Th>
                      <Th className="w-1">{""}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedCallbacks.map((cb) => (
                      <tr key={cb.id}>
                        <Td>
                          <div className="font-medium text-ink-900">
                            {cb.borrower
                              ? `${cb.borrower.firstName} ${cb.borrower.lastName}`
                              : "Unknown borrower"}
                          </div>
                          <div className="mt-0.5 text-[12px] text-ink-400">
                            <span className="id">
                              {cb.applicationNo ??
                                cb.borrower?.borrowerNo ??
                                cb.applicationId.slice(0, 8)}
                            </span>
                          </div>
                        </Td>
                        <Td className="mono">
                          {formatDateTime(cb.scheduledAt)}
                        </Td>
                        <Td className="text-[13px] text-ink-600">
                          {cb.notes?.trim() ? cb.notes : "—"}
                        </Td>
                        <Td>
                          <Link href={`/cig/applications/${cb.applicationId}`}>
                            <Button variant="secondary" size="sm">
                              Open
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
                  page={safeCallbackPage}
                  pageCount={callbackPageCount}
                  onPageChange={setCallbackPage}
                  summary={`Showing ${
                    pagedCallbacks.length
                      ? (safeCallbackPage - 1) * CALLBACK_PAGE_SIZE + 1
                      : 0
                  }–${
                    (safeCallbackPage - 1) * CALLBACK_PAGE_SIZE +
                    pagedCallbacks.length
                  } of ${filteredCallbacks.length}`}
                />
              </div>
            </>
          ) : (
            <EmptyState
              title="No matching callbacks"
              description="Try a different search term."
              showMark={false}
            />
          )}
        </div>
      )}
    </div>
  );
}
