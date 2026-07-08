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
  id: string;
  applicationNo: string | null;
  status: string;
  endorsedAt: string | null;
  borrower: {
    borrowerNo: string;
    firstName: string;
    lastName: string;
  } | null;
};

export default function CigDashboardPage() {
  const [applications, setApplications] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cig/applications");
      if (!res.ok) throw new Error("Failed to load queue");
      const data = (await res.json()) as { applications: QueueItem[] };
      setApplications(data.applications);
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
        title="CIG verification queue"
        description="Endorsed applications awaiting verification. Callback-held files reappear when due."
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {applications.length === 0 ? (
        <Card>
          <p className="text-sm text-zinc-600">No applications in the active queue.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {applications.map((app) => (
            <Card
              key={app.id}
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <div>
                <p className="font-medium text-zinc-900">
                  {app.borrower
                    ? `${app.borrower.firstName} ${app.borrower.lastName}`
                    : "Unknown"}
                  {app.borrower ? (
                    <span className="ml-2 text-sm font-normal text-zinc-500">
                      {app.borrower.borrowerNo}
                    </span>
                  ) : null}
                </p>
                <p className="text-sm text-zinc-500">
                  {formatStatusLabel(app.status)}
                  {app.endorsedAt
                    ? ` · Endorsed ${new Date(app.endorsedAt).toLocaleString()}`
                    : ""}
                </p>
              </div>
              <Link href={`/cig/applications/${app.id}`}>
                <Button variant="secondary">Verify</Button>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
