"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  PageHeader,
  Spinner,
} from "@/components/admin/ui";

type DcrRow = {
  id: string;
  submitted_at: string | null;
  dcr_items: Array<{
    amount: number;
    payments: {
      reference_no: string | null;
      payment_date: string;
      masterlist: { borrower_name: string; loan_account_no: string | null } | null;
    } | null;
  }>;
};

export default function ArDcrPage() {
  const [queue, setQueue] = useState<DcrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [depositRef, setDepositRef] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ar/dcr");
      if (!res.ok) throw new Error("Failed to load");
      const data = (await res.json()) as { dcrQueue: DcrRow[] };
      setQueue(data.dcrQueue);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function reconcile(dcrId: string) {
    const ref = depositRef[dcrId]?.trim();
    if (!ref) return;
    try {
      const res = await fetch(`/api/ar/dcr/${dcrId}/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositReference: ref }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Reconcile failed");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  if (loading) return <Spinner />;

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

      {queue.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-600">No DCRs awaiting reconciliation.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {queue.map((dcr) => (
            <Card key={dcr.id}>
              <p className="mb-2 text-sm text-neutral-500">
                Submitted {dcr.submitted_at ? new Date(dcr.submitted_at).toLocaleString() : "—"}
              </p>
              <ul className="mb-4 space-y-1 text-sm">
                {dcr.dcr_items.map((item, idx) => (
                  <li key={idx}>
                    {item.payments?.masterlist?.borrower_name ?? "Borrower"} ·{" "}
                    {Number(item.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Input
                  placeholder="Bank deposit reference"
                  value={depositRef[dcr.id] ?? ""}
                  onChange={(e) =>
                    setDepositRef((prev) => ({ ...prev, [dcr.id]: e.target.value }))
                  }
                />
                <Button onClick={() => void reconcile(dcr.id)}>Post / Paid</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
