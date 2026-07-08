"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  Button,
  Card,
  PageHeader,
  Spinner,
} from "@/components/admin/ui";

type MasterlistRow = {
  id: string;
  loan_account_no: string | null;
  borrower_name: string;
  borrower_no: string;
  outstanding_balance: number;
  aging_bucket: string;
  account_status: string;
  monthly_amortization: number;
};

type QueueRow = {
  id: string;
  loan_application_id: string;
  queued_at: string;
};

export default function ArDashboardPage() {
  const [masterlist, setMasterlist] = useState<MasterlistRow[]>([]);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      {queue.length > 0 ? (
        <Card className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">Incoming queue</h2>
          <p className="mb-3 text-sm text-neutral-600">
            {queue.length} closed file(s) awaiting masterlist processing (auto-created on close).
          </p>
        </Card>
      ) : null}

      {masterlist.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-600">No masterlist records yet.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {masterlist.map((row) => (
            <Card key={row.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-neutral-900">
                    {row.borrower_name}
                    <span className="ml-2 text-sm font-normal text-neutral-500">
                      {row.borrower_no}
                    </span>
                  </p>
                  <p className="text-sm text-neutral-500">
                    {row.loan_account_no ?? "—"} · Balance{" "}
                    {Number(row.outstanding_balance).toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                    })}{" "}
                    · {row.aging_bucket} · {row.account_status}
                  </p>
                </div>
                <Link href={`/ar/masterlist/${row.id}`}>
                  <Button variant="secondary">Open</Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
