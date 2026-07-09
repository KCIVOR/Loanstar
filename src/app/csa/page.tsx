"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  Badge,
  Button,
  EmptyState,
  PageHeader,
  QueueListItem,
  Spinner,
} from "@/components/ui";
import { formatStatusLabel } from "@/lib/applications/status";

type QueueItem = {
  id: string;
  applicationNo: string | null;
  status: string;
  blocker: string | null;
  isReloan: boolean;
  createdAt: string;
  borrower: {
    borrowerNo: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
};

export default function CsaDashboardPage() {
  const [applications, setApplications] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/csa/applications");
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
        title="CSA intake queue"
        description="Applications pending intake, computation, and endorsement to CIG."
        actions={
          <Link href="/csa/applications/new">
            <Button>New application</Button>
          </Link>
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {applications.length === 0 ? (
        <EmptyState
          title="Queue is clear"
          description="No applications in the intake queue."
          action={
            <Link href="/csa/applications/new">
              <Button>New application</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {applications.map((app) => (
            <QueueListItem
              key={app.id}
              href={`/csa/applications/${app.id}`}
              title={
                app.borrower
                  ? `${app.borrower.firstName} ${app.borrower.lastName}`
                  : "Unknown borrower"
              }
              subtitle={app.borrower?.borrowerNo}
              meta={
                <>
                  <Badge variant="neutral">{formatStatusLabel(app.status)}</Badge>
                  {app.isReloan ? "· Reloan" : null}
                  {app.blocker ? `· ${app.blocker}` : null}
                </>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
