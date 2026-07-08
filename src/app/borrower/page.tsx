"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Alert,
  Button,
  Card,
  PageHeader,
  Spinner,
} from "@/components/admin/ui";
import { StatusTimeline } from "@/components/StatusTimeline";
import { formatStatusLabel } from "@/lib/applications/status";
import type { BorrowerProfile } from "@/lib/borrowers/types";

type Application = {
  id: string;
  applicationNo: string | null;
  status: string;
  statusLabel: string;
  blocker: string | null;
  isReloan: boolean;
  createdAt: string;
};

export default function BorrowerDashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<BorrowerProfile | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloanLoading, setReloanLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileRes, appsRes] = await Promise.all([
        fetch("/api/borrower/profile"),
        fetch("/api/borrower/applications"),
      ]);
      if (!profileRes.ok) throw new Error("Failed to load profile");
      if (!appsRes.ok) throw new Error("Failed to load applications");
      const profileData = (await profileRes.json()) as {
        profile: BorrowerProfile;
      };
      const appsData = (await appsRes.json()) as {
        applications: Application[];
      };
      setProfile(profileData.profile);
      setApplications(appsData.applications ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleReloan() {
    setReloanLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/borrower/applications/reloan", {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to start reloan");
      }
      const json = (await res.json()) as { application: { id: string } };
      router.push(`/borrower/applications/${json.application.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reloan failed");
    } finally {
      setReloanLoading(false);
    }
  }

  if (loading) return <Spinner />;

  const application = applications[0];

  return (
    <div>
      <PageHeader
        title={`Welcome, ${profile?.firstName ?? "Borrower"}`}
        description="Track your loan application and upload documents"
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="text-sm font-medium text-zinc-500">Borrower number</h2>
          <p className="mt-1 font-mono text-xl font-semibold text-zinc-900">
            {profile?.borrowerNo ?? "—"}
          </p>
        </Card>

        <Card>
          <h2 className="text-sm font-medium text-zinc-500">
            Current application
          </h2>
          {application ? (
            <>
              <p className="mt-1 text-lg font-semibold text-zinc-900">
                {application.statusLabel ??
                  formatStatusLabel(application.status)}
              </p>
              {application.applicationNo ? (
                <p className="text-xs text-zinc-500">
                  {application.applicationNo}
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-1 text-zinc-600">No active application</p>
          )}
        </Card>
      </div>

      {application ? (
        <Card className="mt-6 overflow-x-auto">
          <h2 className="mb-4 font-medium text-zinc-900">Application progress</h2>
          <StatusTimeline currentStatus={application.status} />
        </Card>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/borrower/profile">
          <Button variant="secondary">Edit profile</Button>
        </Link>
        {application ? (
          <Link href={`/borrower/applications/${application.id}`}>
            <Button variant="secondary">Documents</Button>
          </Link>
        ) : null}
        <Button onClick={() => void handleReloan()} disabled={reloanLoading}>
          {reloanLoading ? "Starting…" : "Apply for reloan"}
        </Button>
      </div>
    </div>
  );
}
