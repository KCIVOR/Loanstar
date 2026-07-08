"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { BriefingSign } from "@/components/borrower/BriefingSign";
import { ComputationSign } from "@/components/borrower/ComputationSign";
import { LoanActivePanel } from "@/components/borrower/LoanActivePanel";
import { ReleaseDocSign } from "@/components/borrower/ReleaseDocSign";
import {
  Alert,
  Button,
  Card,
  PageHeader,
  Spinner,
} from "@/components/admin/ui";
import { DocumentChecklist } from "@/components/DocumentChecklist";
import { StatusTimeline } from "@/components/StatusTimeline";
import { formatStatusLabel } from "@/lib/applications/status";
import { releaseStageForPath, type ReleasePath } from "@/lib/lra/constants";
import type { BorrowerProfile } from "@/lib/borrowers/types";

type ApplicationDetail = {
  id: string;
  applicationNo: string | null;
  status: string;
  statusLabel: string;
  blocker: string | null;
};

export default function BorrowerApplicationPage() {
  const params = useParams();
  const applicationId = params.id as string;

  const [application, setApplication] = useState<ApplicationDetail | null>(
    null,
  );
  const [borrowerId, setBorrowerId] = useState<string | null>(null);
  const [computation, setComputation] = useState<{
    id: string;
    inputMode: string;
    principal: number;
    netReleased: number;
    totalLoan: number;
    monthlyAmortization: number;
    lineItems: Array<{ key: string; label: string; amount: number }>;
    signedAt: string | null;
    loanTypeName: string | null;
  } | null>(null);
  const [negotiationStatus, setNegotiationStatus] = useState<string | null>(
    null,
  );
  const [releasePath, setReleasePath] = useState<ReleasePath | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [appRes, profileRes, compRes, releaseRes] = await Promise.all([
        fetch(`/api/borrower/applications/${applicationId}`),
        fetch("/api/borrower/profile"),
        fetch(`/api/borrower/applications/${applicationId}/computation`),
        fetch(`/api/borrower/applications/${applicationId}/release-documents`),
      ]);
      if (!appRes.ok) throw new Error("Failed to load application");
      if (!profileRes.ok) throw new Error("Failed to load profile");
      const appData = (await appRes.json()) as {
        application: ApplicationDetail;
      };
      const profileData = (await profileRes.json()) as {
        profile: BorrowerProfile;
      };
      if (compRes.ok) {
        const compData = (await compRes.json()) as {
          computation: typeof computation;
          negotiation: { status: string } | null;
        };
        setComputation(compData.computation);
        setNegotiationStatus(compData.negotiation?.status ?? null);
      }
      if (releaseRes.ok) {
        const releaseData = (await releaseRes.json()) as {
          releaseFile: { releasePath: ReleasePath | null } | null;
        };
        setReleasePath(releaseData.releaseFile?.releasePath ?? null);
      }
      setApplication(appData.application);
      setBorrowerId(profileData.profile.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Spinner />;
  if (!application || !borrowerId) {
    return <Alert>Application not found.</Alert>;
  }

  const signingStage = releasePath ? releaseStageForPath(releasePath) : null;
  const inReleaseFlow = [
    "lra_pending",
    "release_signing",
    "release_briefing",
    "release_ready",
    "released",
  ].includes(application.status);

  return (
    <div>
      <PageHeader
        title="Application documents"
        description={
          application.applicationNo ??
          `Application ${applicationId.slice(0, 8)}…`
        }
        actions={
          <Link href="/borrower">
            <Button variant="secondary">Back to dashboard</Button>
          </Link>
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <Card className="mb-6 overflow-x-auto">
        <p className="text-sm text-zinc-500">Status</p>
        <p className="text-lg font-semibold text-zinc-900">
          {application.statusLabel ?? formatStatusLabel(application.status)}
        </p>
        {application.blocker ? (
          <p className="mt-2 text-sm text-amber-700">{application.blocker}</p>
        ) : null}
        <div className="mt-4">
          <StatusTimeline currentStatus={application.status} />
        </div>
      </Card>

      <ReleaseDocSign applicationId={application.id} onSigned={() => void load()} />

      <BriefingSign applicationId={application.id} onSigned={() => void load()} />

      <LoanActivePanel
        applicationId={application.id}
        applicationStatus={application.status}
      />

      <ComputationSign
        applicationId={application.id}
        applicationStatus={application.status}
        negotiationStatus={negotiationStatus}
        computation={computation}
        onSigned={() => void load()}
      />

      {inReleaseFlow && signingStage ? (
        <DocumentChecklist
          applicationId={application.id}
          borrowerId={borrowerId}
          stage={signingStage}
          onUploadComplete={() => void load()}
        />
      ) : null}

      <DocumentChecklist
        applicationId={application.id}
        borrowerId={borrowerId}
        stage="intake"
        onUploadComplete={() => void load()}
      />
    </div>
  );
}
