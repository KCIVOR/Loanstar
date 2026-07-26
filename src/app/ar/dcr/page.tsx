"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Spinner,
  Table,
  Td,
  Th,
} from "@/components/ui";

type DcrRow = {
  id: string;
  submitted_at: string | null;
  dcr_items: Array<{
    id?: string;
    amount: number;
    payments: {
      id?: string;
      reference_no: string | null;
      payment_date: string;
      amount?: number;
      masterlist_id?: string;
      storage_path?: string | null;
      file_name?: string | null;
      masterlist: {
        borrower_name: string;
        loan_account_no: string | null;
      } | null;
    } | null;
  }>;
};

function formatMoney(value: number) {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

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
const IconList = (
  <svg {...iconProps}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </svg>
);
const IconCash = (
  <svg {...iconProps}>
    <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

const KPI_TONES = {
  navy: { background: "var(--navy-50)", color: "var(--navy-700)" },
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

export default function ArDcrPage() {
  const [queue, setQueue] = useState<DcrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState<string | null>(null);
  const [depositRef, setDepositRef] = useState<Record<string, string>>({});
  const [depositAmt, setDepositAmt] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const res = await fetch("/api/ar/dcr");
      if (!res.ok) throw new Error("Failed to load");
      const data = (await res.json()) as { dcrQueue: DcrRow[] };
      setQueue(data.dcrQueue);
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

  async function viewProof(paymentId: string) {
    setError(null);
    setViewingId(paymentId);
    try {
      const res = await fetch(`/api/ar/payments/${paymentId}/download`);
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

  async function reconcile(dcrId: string) {
    const ref = depositRef[dcrId]?.trim();
    const amount = Number(depositAmt[dcrId]);
    if (!ref || !amount) return;
    setReconciling(dcrId);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/ar/dcr/${dcrId}/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositReference: ref, depositAmount: amount }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Reconcile failed");
      }
      setConfirmId(null);
      setDepositRef((prev) => {
        const next = { ...prev };
        delete next[dcrId];
        return next;
      });
      setDepositAmt((prev) => {
        const next = { ...prev };
        delete next[dcrId];
        return next;
      });
      setMessage("DCR posted — payments marked Paid.");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setReconciling(null);
    }
  }

  if (loading) return <Spinner />;

  const lineItemCount = queue.reduce(
    (sum, dcr) => sum + (dcr.dcr_items?.length ?? 0),
    0,
  );
  const totalToPost = queue.reduce(
    (sum, dcr) =>
      sum +
      (dcr.dcr_items ?? []).reduce(
        (inner, item) => inner + Number(item.amount ?? 0),
        0,
      ),
    0,
  );

  const term = search.trim().toLowerCase();
  const filtered = queue.filter((dcr) => {
    if (!term) return true;
    if (dcr.id.toLowerCase().includes(term)) return true;
    return (dcr.dcr_items ?? []).some((item) => {
      const name = item.payments?.masterlist?.borrower_name?.toLowerCase() ?? "";
      const acct =
        item.payments?.masterlist?.loan_account_no?.toLowerCase() ?? "";
      const ref = item.payments?.reference_no?.toLowerCase() ?? "";
      return name.includes(term) || acct.includes(term) || ref.includes(term);
    });
  });

  const confirmDcr = confirmId
    ? queue.find((d) => d.id === confirmId) ?? null
    : null;
  const confirmTotal = confirmDcr
    ? (confirmDcr.dcr_items ?? []).reduce(
        (sum, item) => sum + Number(item.amount ?? 0),
        0,
      )
    : 0;

  return (
    <div>
      <PageHeader
        title="DCR reconciliation"
        description="Match bank deposits and post payments — the only path to Paid."
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

      <div className="kpi-grid mb-6">
        <Kpi
          tone="navy"
          icon={IconLayers}
          label="Pending DCRs"
          value={queue.length}
        />
        <Kpi
          tone="warning"
          icon={IconList}
          label="Line items"
          value={lineItemCount}
        />
        <Kpi
          tone="teal"
          icon={IconCash}
          label="Total to post"
          value={`₱${formatMoney(totalToPost)}`}
        />
      </div>

      {queue.length === 0 ? (
        <EmptyState
          title="No DCRs pending"
          description="Submitted collector DCRs will appear here for deposit matching."
        />
      ) : (
        <div className="flex flex-col gap-3.5">
          <div className="tbl-toolbar">
            <div className="gsearch" style={{ maxWidth: 320 }}>
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
                placeholder="Search borrower, account, or payment ref"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title="No matching DCRs"
              description="Try a different search term."
              showMark={false}
            />
          ) : (
            filtered.map((dcr) => {
              const items = dcr.dcr_items ?? [];
              const batchTotal = items.reduce(
                (sum, item) => sum + Number(item.amount ?? 0),
                0,
              );
              const shortId = dcr.id.slice(0, 8);

              return (
                <Card key={dcr.id}>
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-display text-lg font-semibold text-navy-900">
                          DCR
                        </h2>
                        <span className="id">{shortId}</span>
                        <Badge variant="warning" dot>
                          Submitted
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-ink-500">
                        Submitted{" "}
                        <span className="mono">
                          {dcr.submitted_at
                            ? formatDateTime(dcr.submitted_at)
                            : "—"}
                        </span>
                        {" · "}
                        <span className="mono font-semibold text-teal-600">
                          ₱{formatMoney(batchTotal)}
                        </span>
                        {" · "}
                        {items.length} item{items.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>

                  <div className="mb-4 overflow-x-auto">
                    <Table>
                      <thead>
                        <tr>
                          <Th>Borrower</Th>
                          <Th>Account</Th>
                          <Th className="num">Amount</Th>
                          <Th>Payment ref</Th>
                          <Th>Date</Th>
                          <Th>Proof</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, idx) => {
                          const masterlistId = item.payments?.masterlist_id;
                          const name =
                            item.payments?.masterlist?.borrower_name ??
                            "Borrower";
                          const acct =
                            item.payments?.masterlist?.loan_account_no ?? "—";
                          return (
                            <tr key={item.id ?? `${dcr.id}-${idx}`}>
                              <Td>
                                {masterlistId ? (
                                  <Link
                                    href={`/ar/masterlist/${masterlistId}`}
                                    className="font-medium text-teal-700 hover:underline"
                                  >
                                    {name}
                                  </Link>
                                ) : (
                                  <span className="font-medium text-ink-900">
                                    {name}
                                  </span>
                                )}
                              </Td>
                              <Td>
                                <span className="id">{acct}</span>
                              </Td>
                              <Td className="num mono text-teal-600">
                                {formatMoney(Number(item.amount))}
                              </Td>
                              <Td className="mono">
                                {item.payments?.reference_no ?? "—"}
                              </Td>
                              <Td className="mono">
                                {item.payments?.payment_date
                                  ? formatDate(item.payments.payment_date)
                                  : "—"}
                              </Td>
                              <Td>
                                {item.payments?.id &&
                                item.payments.storage_path ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    loading={viewingId === item.payments.id}
                                    onClick={() =>
                                      void viewProof(item.payments!.id!)
                                    }
                                  >
                                    View
                                  </Button>
                                ) : (
                                  <span className="text-ink-400">—</span>
                                )}
                              </Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Table>
                  </div>

                  <div className="flex flex-wrap items-end gap-2 border-t border-line-soft pt-4">
                    <div className="min-w-[220px] flex-1">
                      <Label htmlFor={`deposit-${dcr.id}`} required>
                        Bank deposit reference
                      </Label>
                      <Input
                        id={`deposit-${dcr.id}`}
                        placeholder="Deposit slip / bank ref"
                        value={depositRef[dcr.id] ?? ""}
                        onChange={(e) =>
                          setDepositRef((prev) => ({
                            ...prev,
                            [dcr.id]: e.target.value,
                          }))
                        }
                        className="mono"
                      />
                    </div>
                    <div className="min-w-[180px]">
                      <Label htmlFor={`deposit-amt-${dcr.id}`} required>
                        Deposit amount
                      </Label>
                      <Input
                        id={`deposit-amt-${dcr.id}`}
                        type="number"
                        step="0.01"
                        placeholder={formatMoney(batchTotal)}
                        value={depositAmt[dcr.id] ?? ""}
                        onChange={(e) =>
                          setDepositAmt((prev) => ({
                            ...prev,
                            [dcr.id]: e.target.value,
                          }))
                        }
                        className="mono"
                      />
                      {depositAmt[dcr.id] &&
                      Number(depositAmt[dcr.id]) !== batchTotal ? (
                        <p className="mt-1 text-xs text-warning">
                          Does not match DCR total ₱{formatMoney(batchTotal)}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      loading={reconciling === dcr.id}
                      disabled={
                        !depositRef[dcr.id]?.trim() ||
                        !Number(depositAmt[dcr.id])
                      }
                      onClick={() => setConfirmId(dcr.id)}
                    >
                      Post / Paid
                    </Button>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmId !== null}
        title="Post this DCR?"
        message={
          confirmDcr
            ? `This posts ₱${formatMoney(confirmTotal)} against deposit reference “${depositRef[confirmDcr.id]?.trim() ?? ""}” and marks the included payments as Paid. This cannot be undone from this screen.`
            : "Post this DCR to the ledger?"
        }
        confirmLabel="Yes, post / Paid"
        loading={reconciling === confirmId}
        onCancel={() => setConfirmId(null)}
        onConfirm={() => {
          if (confirmId) void reconcile(confirmId);
        }}
      />
    </div>
  );
}
