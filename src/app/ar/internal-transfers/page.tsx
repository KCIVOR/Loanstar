"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Label,
  PageHeader,
  Skeleton,
  Table,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/ar/format";

type TransferRow = {
  id: string;
  sourceLoanApplicationId: string;
  sourceApplicationNo: string | null;
  sourceLoanAccountNo: string | null;
  targetMasterlistId: string;
  targetLoanAccountNo: string | null;
  targetOutstandingBalance: number;
  transferType: "other_loan" | "offset";
  months: number | null;
  amount: number;
  createdAt: string;
};

function transferLabel(row: TransferRow): string {
  if (row.transferType === "other_loan") return "Offset (full payoff)";
  return row.months ? `Other Loan (${row.months} mo${row.months > 1 ? "s" : ""})` : "Other Loan";
}

export default function ArInternalTransfersPage() {
  const [rows, setRows] = useState<TransferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<TransferRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<TransferRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ar/internal-transfers");
      if (!res.ok) throw new Error("Failed to load pending transfers");
      const data = (await res.json()) as { transfers: TransferRow[] };
      setRows(data.transfers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPending = rows.reduce((sum, row) => sum + row.amount, 0);

  async function handleConfirm() {
    if (!confirmTarget) return;
    setActing(confirmTarget.id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/ar/internal-transfers/${confirmTarget.id}/confirm`,
        { method: "POST" },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Confirm failed");
      setMessage(
        `Posted — ${confirmTarget.targetLoanAccountNo ?? "target account"} balance updated.`,
      );
      setConfirmTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirm failed");
    } finally {
      setActing(null);
    }
  }

  async function handleReject() {
    if (!rejectTarget || !rejectReason.trim()) return;
    setActing(rejectTarget.id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/ar/internal-transfers/${rejectTarget.id}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: rejectReason.trim() }),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Reject failed");
      setMessage("Transfer rejected — no balance change.");
      setRejectTarget(null);
      setRejectReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setActing(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Internal transfers"
        description="Other Loan / Offset deductions from released loans, awaiting confirmation before they reduce the target account's balance."
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

      <div className="kpi-grid mb-4">
        {!loading ? (
          <>
            <div className="card stat">
              <div className="k">Pending transfers</div>
              <div className="v">{rows.length}</div>
            </div>
            <div className="card stat">
              <div className="k">Total amount pending</div>
              <div className="v">{formatMoney(totalPending)}</div>
            </div>
          </>
        ) : (
          <>
            <Skeleton variant="kpi" />
            <Skeleton variant="kpi" />
          </>
        )}
      </div>

      {loading ? (
        <div className="mb-4">
          <Table>
            <thead>
              <tr>
                <Th>Source loan</Th>
                <Th>Target account</Th>
                <Th>Type</Th>
                <Th num>Amount</Th>
                <Th>Requested</Th>
                <Th className="w-1">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 4 }, (_, i) => (
                <tr key={i}>
                  <Td colSpan={6}>
                    <Skeleton variant="line" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nothing pending"
          description="No Other Loan / Offset transfers are waiting for review right now."
          showMark={false}
        />
      ) : (
        <div className="mb-4">
          <Table>
            <thead>
              <tr>
                <Th>Source loan</Th>
                <Th>Target account</Th>
                <Th>Type</Th>
                <Th num>Amount</Th>
                <Th>Requested</Th>
                <Th className="w-1">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <Td>
                    <Link
                      href={`/lra/applications/${row.sourceLoanApplicationId}`}
                      className="mono text-sm font-medium text-teal-700 hover:underline"
                    >
                      {row.sourceApplicationNo ?? row.sourceLoanAccountNo ?? "—"}
                    </Link>
                  </Td>
                  <Td>
                    <Link
                      href={`/ar/masterlist/${row.targetMasterlistId}`}
                      className="mono text-sm font-medium text-teal-700 hover:underline"
                    >
                      {row.targetLoanAccountNo ?? "—"}
                    </Link>
                    <div className="mono text-xs text-ink-400">
                      Current balance {formatMoney(row.targetOutstandingBalance)}
                    </div>
                  </Td>
                  <Td>
                    <Badge variant={row.transferType === "other_loan" ? "navy" : "teal"} dot>
                      {transferLabel(row)}
                    </Badge>
                  </Td>
                  <Td num className="mono font-semibold text-teal-600">
                    {formatMoney(row.amount)}
                  </Td>
                  <Td className="mono">{formatDate(row.createdAt)}</Td>
                  <Td>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        loading={acting === row.id}
                        onClick={() => setConfirmTarget(row)}
                      >
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="danger-soft"
                        disabled={acting === row.id}
                        onClick={() => {
                          setRejectTarget(row);
                          setRejectReason("");
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <ConfirmDialog
        open={confirmTarget != null}
        title="Confirm internal transfer?"
        message={
          confirmTarget ? (
            <>
              Reduce{" "}
              <span className="mono font-bold text-teal-600">
                {confirmTarget.targetLoanAccountNo ?? "the target account"}
              </span>
              &apos;s balance by{" "}
              <span className="mono font-bold text-teal-600">
                {formatMoney(confirmTarget.amount)}
              </span>
              , using proceeds from{" "}
              <span className="mono font-bold text-teal-600">
                {confirmTarget.sourceApplicationNo ?? "the source loan"}
              </span>
              . This cannot be undone.
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Yes, post it"
        cancelLabel="Cancel"
        loading={acting === confirmTarget?.id}
        onConfirm={() => void handleConfirm()}
        onCancel={() => setConfirmTarget(null)}
      />

      <ConfirmDialog
        open={rejectTarget != null}
        title="Reject internal transfer?"
        message={
          <div className="flex flex-col gap-3">
            <p>
              No balance change will happen. Explain why this transfer is
              being rejected — this stays on record.
            </p>
            <div>
              <Label htmlFor="rejectReason" required>
                Reason
              </Label>
              <Textarea
                id="rejectReason"
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. wrong target account, amount doesn't match paperwork…"
              />
            </div>
          </div>
        }
        confirmLabel="Reject"
        cancelLabel="Cancel"
        loading={acting === rejectTarget?.id}
        onConfirm={() => void handleReject()}
        onCancel={() => setRejectTarget(null)}
      />
    </div>
  );
}
