"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  Spinner,
  Table,
  Td,
  Th,
} from "@/components/ui";

type BriefingItem = {
  key: string;
  label: string;
};

type QueueItem = {
  releaseFileId: string;
  releasePath: string | null;
  updatedAt: string;
  application: {
    id: string;
    applicationNo: string | null;
    status: string;
  } | null;
  borrower: {
    borrowerNo: string;
    firstName: string;
    lastName: string;
  } | null;
  briefing: {
    acknowledgedAt: string | null;
    checklist: BriefingItem[] | null;
  } | null;
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CollectorBriefingsPage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmItem, setConfirmItem] = useState<QueueItem | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const res = await fetch("/api/collector/briefings");
      if (!res.ok) throw new Error("Failed to load briefing queue");
      const data = (await res.json()) as { items: QueueItem[] };
      setItems(data.items);
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

  async function acknowledge(releaseFileId: string) {
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/collector/briefings/${releaseFileId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to check off briefing");
      }
      setConfirmItem(null);
      setMessage("Briefing checked off — file is ready for release.");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setActing(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Pre-release briefings"
        description="Files handed off by LRA — brief the borrower on payment rules and legal consequences, then check off the briefing to unlock release."
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

      {items.length === 0 ? (
        <EmptyState
          title="No briefings pending"
          description="Files will appear here once LRA completes the signing session."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Borrower</Th>
              <Th>Path</Th>
              <Th>Signed since</Th>
              <Th className="w-1">{""}</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.releaseFileId}>
                <Td>
                  <div className="font-medium text-ink-900">
                    {item.borrower
                      ? `${item.borrower.firstName} ${item.borrower.lastName}`
                      : "Unknown borrower"}
                  </div>
                  <span className="id">
                    {item.application?.applicationNo ??
                      item.borrower?.borrowerNo ??
                      item.releaseFileId.slice(0, 8)}
                  </span>
                </Td>
                <Td>
                  <Badge variant="navy" dot>
                    {item.releasePath === "with_pdc"
                      ? "With PDC"
                      : item.releasePath === "without_pdc"
                        ? "Without PDC"
                        : "—"}
                  </Badge>
                </Td>
                <Td className="mono">{formatDateTime(item.updatedAt)}</Td>
                <Td>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirmItem(item)}
                  >
                    Conduct briefing
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <ConfirmDialog
        open={confirmItem !== null}
        title="Check off this briefing?"
        message={
          <>
            Confirm you have briefed{" "}
            <span className="font-medium text-ink-900">
              {confirmItem?.borrower
                ? `${confirmItem.borrower.firstName} ${confirmItem.borrower.lastName}`
                : "the borrower"}
            </span>{" "}
            on the items below. This unlocks release and cannot be undone.
          </>
        }
        confirmLabel="Briefing completed"
        cancelLabel="Cancel"
        loading={acting}
        onCancel={() => setConfirmItem(null)}
        onConfirm={() => {
          if (confirmItem) void acknowledge(confirmItem.releaseFileId);
        }}
      >
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-500">
          {(confirmItem?.briefing?.checklist ?? []).map((item) => (
            <li key={item.key}>{item.label}</li>
          ))}
        </ul>
      </ConfirmDialog>
    </div>
  );
}
