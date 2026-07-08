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
        <Card>
          <p className="text-sm text-neutral-600">No applications in the intake queue.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {applications.map((app) => (
            <Card key={app.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-neutral-900">
                  {app.borrower
                    ? `${app.borrower.firstName} ${app.borrower.lastName}`
                    : "Unknown borrower"}
                  {app.borrower ? (
                    <span className="ml-2 text-sm font-normal text-neutral-500">
                      {app.borrower.borrowerNo}
                    </span>
                  ) : null}
                </p>
                <p className="text-sm text-neutral-500">
                  {formatStatusLabel(app.status)}
                  {app.isReloan ? " · Reloan" : ""}
                  {app.blocker ? ` · ${app.blocker}` : ""}
                </p>
              </div>
              <Link href={`/csa/applications/${app.id}`}>
                <Button variant="secondary">Open</Button>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
