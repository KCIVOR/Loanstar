"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import {
  Alert,
  Button,
  Card,
  PageHeader,
  Spinner,
} from "@/components/admin/ui";
import { DocumentChecklist } from "@/components/DocumentChecklist";
import type { ChecklistItem } from "@/lib/documents/checklist";

type LeadDetail = {
  id: string;
  borrowerName: string;
  businessName: string | null;
  status: string;
  applicationId: string | null;
  borrowerId: string | null;
};

type ChecklistFlag = {
  documentTypeId: string;
  documentTypeSlug: string;
  documentTypeName: string;
  stage: string;
  isRequired: boolean;
  isOptionalFlag: boolean;
  sortOrder: number;
  completionStatus: string;
};

function flagsToChecklistItems(flags: ChecklistFlag[]): ChecklistItem[] {
  return flags.map((flag) => ({
    documentTypeId: flag.documentTypeId,
    documentTypeSlug: flag.documentTypeSlug,
    documentTypeName: flag.documentTypeName,
    stage: flag.stage,
    isRequired: flag.isRequired,
    isOptionalFlag: flag.isOptionalFlag,
    sortOrder: flag.sortOrder,
    documentId: null,
    status:
      flag.completionStatus === "complete" ||
      flag.completionStatus === "uploaded"
        ? flag.completionStatus === "complete"
          ? "confirmed"
          : "uploaded"
        : "pending",
    fileName: null,
    mimeType: null,
    fileSize: null,
    uploadedBy: null,
    confirmedBy: null,
    confirmedAt: null,
  }));
}

export default function AgentLeadDetailPage() {
  const params = useParams();
  const leadId = params.id as string;

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [flags, setFlags] = useState<ChecklistFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/agent/leads/${leadId}`);
      if (!res.ok) throw new Error("Failed to load lead");
      const data = (await res.json()) as {
        lead: LeadDetail;
        checklistFlags: ChecklistFlag[];
      };
      setLead(data.lead);
      setFlags(data.checklistFlags ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  const checklistItems = useMemo(() => flagsToChecklistItems(flags), [flags]);

  if (loading) return <Spinner />;
  if (!lead) return <Alert>Lead not found.</Alert>;

  return (
    <div>
      <PageHeader
        title={lead.borrowerName}
        description={lead.businessName ?? "Lead details"}
        actions={
          <Link href="/agent">
            <Button variant="secondary">Back to leads</Button>
          </Link>
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <Card className="mb-6">
        <p className="text-sm text-zinc-500">Status</p>
        <p className="capitalize text-lg font-semibold text-zinc-900">
          {lead.status}
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          You can see checklist completion flags only — document content is not
          accessible from the agent portal.
        </p>
      </Card>

      {lead.applicationId && lead.borrowerId ? (
        <DocumentChecklist
          applicationId={lead.applicationId}
          borrowerId={lead.borrowerId}
          stage="intake"
          flagsOnly
          initialItems={checklistItems}
          uploadApiPath={`/api/agent/leads/${leadId}/documents`}
          onUploadComplete={() => void load()}
        />
      ) : (
        <Card>
          <p className="text-sm text-zinc-600">
            No application linked yet. Checklist will appear once the borrower
            registers or an application is created.
          </p>
        </Card>
      )}
    </div>
  );
}
