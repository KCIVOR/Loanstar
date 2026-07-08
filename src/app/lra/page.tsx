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
import { formatStatusLabel } from "@/lib/applications/status";

type QueueItem = {
  applicationId: string;
  queuedAt: string;
  application: {
    applicationNo: string | null;
    status: string;
    blocker: string | null;
  } | null;
  borrower: {
    borrowerNo: string;
    firstName: string;
    lastName: string;
  } | null;
};

export default function LraDashboardPage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/lra/queue");
      if (!res.ok) throw new Error("Failed to load queue");
      const data = (await res.json()) as { queue: QueueItem[] };
      setQueue(data.queue);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="LRA release queue"
        description="Files with signed computation ready for documentation and release."
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {queue.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-600">No files pending LRA processing.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {queue.map((item) => (
            <Card key={item.applicationId}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-neutral-900">
                    {item.borrower
                      ? `${item.borrower.firstName} ${item.borrower.lastName}`
                      : "Unknown"}
                    {item.borrower ? (
                      <span className="ml-2 text-sm font-normal text-neutral-500">
                        {item.borrower.borrowerNo}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm text-neutral-500">
                    {item.application
                      ? formatStatusLabel(item.application.status)
                      : ""}
                    {item.application?.blocker
                      ? ` · ${item.application.blocker}`
                      : ""}
                    {` · Queued ${new Date(item.queuedAt).toLocaleString()}`}
                  </p>
                </div>
                <Link href={`/lra/applications/${item.applicationId}`}>
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
