"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
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
  firstJoin,
  formatDate,
  formatMoney,
  paymentStatusVariant,
} from "@/lib/collector/format";

type MasterlistJoin = {
  borrower_name: string;
  loan_account_no: string | null;
};

type Payment = {
  id: string;
  reference_no: string | null;
  payment_date: string;
  amount: number;
  status: string;
  storage_path: string | null;
  file_name: string | null;
  masterlist?: MasterlistJoin | MasterlistJoin[] | null;
};

const PAGE_SIZE = 10;
type ProofFilter = "all" | "pending_verification" | "confirmed";

export default function CollectorProofsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ProofFilter>("all");
  const [page, setPage] = useState(1);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const res = await fetch("/api/collector/payments?scope=desk");
      if (!res.ok) throw new Error("Failed to load proofs");
      const data = (await res.json()) as { payments: Payment[] };
      setPayments(data.payments);
      if (!opts?.silent) setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function viewProof(id: string) {
    setError(null);
    setViewingId(id);
    try {
      const res = await fetch(`/api/collector/payments/${id}/download`);
      const body = (await res.json()) as {
        signedUrl?: string;
        error?: string;
      };
      if (!res.ok || !body.signedUrl) {
        throw new Error(body.error ?? "Download failed");
      }
      window.open(body.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setViewingId(null);
    }
  }

  async function reviewPayment(id: string, status: "confirmed" | "rejected") {
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/collector/payments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Review failed");
      }
      setRejectId(null);
      setMessage(
        status === "confirmed" ? "Payment confirmed." : "Payment rejected.",
      );
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setActing(false);
    }
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return payments.filter((pay) => {
      if (filter !== "all" && pay.status !== filter) return false;
      if (!term) return true;
      const ml = firstJoin(pay.masterlist);
      return (
        (pay.reference_no?.toLowerCase().includes(term) ?? false) ||
        (ml?.borrower_name.toLowerCase().includes(term) ?? false) ||
        (ml?.loan_account_no?.toLowerCase().includes(term) ?? false)
      );
    });
  }, [payments, search, filter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Payment proofs"
        description="Confirm or reject borrower payment uploads. Batch confirmed proofs on the DCR page."
        actions={
          <Link href="/collector/dcr" className="btn btn-secondary">
            Go to DCR
          </Link>
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

      {payments.length === 0 ? (
        <EmptyState
          title="No proofs to review"
          description="Pending and confirmed (not yet submitted) proofs appear here."
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
                placeholder="Search ref, borrower, account"
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
                  ["all", "All"],
                  ["pending_verification", "Pending"],
                  ["confirmed", "Confirmed"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={cn("fchip", filter === value && "on")}
                  onClick={() => {
                    setFilter(value);
                    setPage(1);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="tbl-wrap">
            <Table>
              <thead>
                <tr>
                  <Th>Borrower</Th>
                  <Th>Reference</Th>
                  <Th>Date</Th>
                  <Th num>Amount</Th>
                  <Th>Status</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {paged.map((pay) => {
                  const ml = firstJoin(pay.masterlist);
                  return (
                    <tr key={pay.id}>
                      <Td>
                        <div className="font-medium text-ink-900">
                          {ml?.borrower_name ?? "—"}
                        </div>
                        <div className="mono text-xs text-ink-500">
                          {ml?.loan_account_no ?? "—"}
                        </div>
                      </Td>
                      <Td className="mono">{pay.reference_no ?? "—"}</Td>
                      <Td className="mono">{formatDate(pay.payment_date)}</Td>
                      <Td num className="mono text-teal-600">
                        {formatMoney(Number(pay.amount))}
                      </Td>
                      <Td>
                        <Badge variant={paymentStatusVariant(pay.status)}>
                          {pay.status.replaceAll("_", " ")}
                        </Badge>
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1.5">
                          {pay.status === "pending_verification" ? (
                            <>
                              <Button
                                variant="secondary"
                                size="sm"
                                loading={acting}
                                onClick={() =>
                                  void reviewPayment(pay.id, "confirmed")
                                }
                              >
                                Confirm
                              </Button>
                              <Button
                                variant="danger-soft"
                                size="sm"
                                loading={acting}
                                onClick={() => setRejectId(pay.id)}
                              >
                                Reject
                              </Button>
                            </>
                          ) : pay.status === "confirmed" ? (
                            <Link
                              href="/collector/dcr"
                              className="btn btn-secondary btn-sm"
                            >
                              Add via DCR
                            </Link>
                          ) : null}
                          {pay.storage_path ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              loading={viewingId === pay.id}
                              onClick={() => void viewProof(pay.id)}
                            >
                              View
                            </Button>
                          ) : null}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>

          {filtered.length > PAGE_SIZE ? (
            <Pagination
              page={safePage}
              pageCount={pageCount}
              onPageChange={setPage}
            />
          ) : null}
        </div>
      )}

      <ConfirmDialog
        open={rejectId !== null}
        title="Reject payment proof?"
        message="The borrower proof will be marked rejected."
        confirmLabel="Reject"
        variant="danger"
        loading={acting}
        onConfirm={() => {
          if (rejectId) void reviewPayment(rejectId, "rejected");
        }}
        onCancel={() => setRejectId(null)}
      />
    </div>
  );
}
