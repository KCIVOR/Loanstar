"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import {
  Alert,
  Badge,
  Breadcrumbs,
  EmptyState,
  PageHeader,
  Spinner,
} from "@/components/ui";
import { DocumentChecklist } from "@/components/DocumentChecklist";
import type { ChecklistItem } from "@/lib/documents/checklist";
import {
  leadPipelineStage,
  leadStatusVariant,
  pipelineStageLabel,
  pipelineStageVariant,
  type LeadPipelineStage,
} from "@/lib/agent/pipeline";

type LeadDetail = {
  id: string;
  borrowerName: string;
  businessName: string | null;
  status: string;
  applicationId: string | null;
  borrowerId: string | null;
  createdAt?: string;
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

type ChecklistSummary = {
  required: number;
  complete: number;
  percent: number | null;
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
    revisionRemarks: null,
  }));
}

function stageHint(stage: LeadPipelineStage): string {
  if (stage === "awaiting_link") {
    return "Borrower has not registered / no application is linked yet.";
  }
  if (stage === "gathering_docs") {
    return "Help the borrower finish required intake documents.";
  }
  return "Required intake documents look complete — ready for CSA intake.";
}

export default function AgentLeadDetailPage() {
  const params = useParams();
  const leadId = params.id as string;

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [flags, setFlags] = useState<ChecklistFlag[]>([]);
  const [summary, setSummary] = useState<ChecklistSummary>({
    required: 0,
    complete: 0,
    percent: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const res = await fetch(`/api/agent/leads/${leadId}`);
        if (!res.ok) throw new Error("Failed to load lead");
        const data = (await res.json()) as {
          lead: LeadDetail;
          checklistFlags: ChecklistFlag[];
          checklistSummary?: ChecklistSummary;
        };
        setLead(data.lead);
        setFlags(data.checklistFlags ?? []);
        setSummary(
          data.checklistSummary ?? {
            required: 0,
            complete: 0,
            percent: null,
          },
        );
        if (!opts?.silent) setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [leadId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const checklistItems = useMemo(() => flagsToChecklistItems(flags), [flags]);

  if (loading) return <Spinner />;
  if (!lead) return <Alert>Lead not found.</Alert>;

  const stage = leadPipelineStage({
    applicationId: lead.applicationId,
    checklistPercent: summary.percent,
  });
  const percent = summary.percent;

  return (
    <div>
      <Breadcrumbs
        className="mb-3"
        items={[
          { label: "Pipeline", href: "/agent" },
          { label: lead.borrowerName },
        ]}
      />
      <PageHeader
        title={lead.borrowerName}
        description={lead.businessName ?? "Lead workspace"}
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {stage === "awaiting_link" ? (
        <div className="banner warn mb-6">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
          <span>
            No application linked — checklist appears after the borrower
            registers or an application is attached to this lead.
          </span>
        </div>
      ) : null}

      {/* Readiness strip — unique to agent (not AR money / LRA stepper) */}
      <div className="mb-6 overflow-hidden rounded-[var(--r-md)] border border-navy-800 bg-navy-950 text-white">
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-4">
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-navy-200 opacity-80">
              Pipeline
            </div>
            <div className="mt-2">
              <Badge variant={pipelineStageVariant(stage)}>
                {pipelineStageLabel(stage)}
              </Badge>
            </div>
          </div>
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-navy-200 opacity-80">
              Lead status
            </div>
            <div className="mt-2">
              <Badge variant={leadStatusVariant(lead.status)}>
                {lead.status}
              </Badge>
            </div>
          </div>
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-navy-200 opacity-80">
              Application
            </div>
            <div className="mt-2 font-medium">
              {lead.applicationId ? "Linked" : "Not linked"}
            </div>
          </div>
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-navy-200 opacity-80">
              Checklist
            </div>
            <div className="mt-2 mono text-lg font-semibold text-teal-300">
              {percent === null
                ? "—"
                : `${summary.complete}/${summary.required}`}
            </div>
          </div>
        </div>
        <div className="border-t border-navy-800 px-5 py-4">
          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
            <span className="text-navy-100">{stageHint(stage)}</span>
            {percent !== null ? (
              <span className="mono text-teal-300">{percent}%</span>
            ) : null}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-navy-800">
            <div
              className="h-full rounded-full bg-teal-400 transition-[width]"
              style={{ width: `${percent ?? 0}%` }}
            />
          </div>
        </div>
      </div>

      <p className="mb-4 text-xs text-ink-400">
        Flags-only view — you can upload for the borrower but cannot open file
        contents from the agent portal.
      </p>

      {lead.applicationId && lead.borrowerId ? (
        <DocumentChecklist
          applicationId={lead.applicationId}
          borrowerId={lead.borrowerId}
          stage="intake"
          flagsOnly
          excludeSlugs={["clearance_form"]}
          initialItems={checklistItems}
          uploadApiPath={`/api/agent/leads/${leadId}/documents`}
          onUploadComplete={() => void load({ silent: true })}
        />
      ) : (
        <EmptyState
          title="Waiting for application link"
          description="Once linked, required intake documents will show here with completion flags."
          showMark={false}
        />
      )}
    </div>
  );
}
