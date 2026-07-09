"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  Badge,
  Button,
  Card,
  PageHeader,
  Spinner,
} from "@/components/ui";
import { formatStatusLabel } from "@/lib/applications/status";

type CommitteeItem = {
  id: string;
  applicationNo: string | null;
  status: string;
  updatedAt: string;
  borrower: {
    borrowerNo: string;
    firstName: string;
    lastName: string;
  } | null;
  verification: {
    finding: string | null;
    forwardedAt: string | null;
  } | null;
  tatDays: number | null;
};

export default function CommitteeDashboardPage() {
  const [applications, setApplications] = useState<CommitteeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/committee/applications");
      if (!res.ok) throw new Error("Failed to load queue");
      const data = (await res.json()) as { applications: CommitteeItem[] };
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
        title="Committee queue"
        description="Applications auto-forwarded from CIG after verification is complete."
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {applications.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-muted">No files pending committee decision.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {applications.map((app) => (
            <Card key={app.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">
                    {app.borrower
                      ? `${app.borrower.firstName} ${app.borrower.lastName}`
                      : "Unknown"}
                    {app.borrower ? (
                      <span className="ml-2 font-mono text-sm font-normal text-ink-muted">
                        {app.borrower.borrowerNo}
                      </span>
                    ) : null}
                  </p>
                  <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
                    <Badge variant="neutral">{formatStatusLabel(app.status)}</Badge>
                    {app.verification?.finding
                      ? `· CIG finding: ${app.verification.finding}`
                      : ""}
                    {app.verification?.forwardedAt ? (
                      <>
                        {" · Forwarded "}
                        <span className="font-mono">
                          {new Date(app.verification.forwardedAt).toLocaleString()}
                        </span>
                      </>
                    ) : null}
                    {app.tatDays != null ? ` · TAT ${app.tatDays}d` : ""}
                  </p>
                </div>
                <Link href={`/committee/applications/${app.id}`}>
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
