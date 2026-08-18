"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import {
  Alert,
  Avatar,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  ConfirmDialog,
  Input,
  Label,
  PageHeader,
  Select,
  Spinner,
  Stepper,
  Textarea,
  Modal,
} from "@/components/ui";
import { DocumentChecklist } from "@/components/DocumentChecklist";
import { ApplicantProfileFields } from "@/components/borrowers/ApplicantProfileFields";
import {
  NegotiationLog,
  type NegotiationLogMessage,
} from "@/components/negotiation/NegotiationLog";
import {
  CiReferencesFormModal,
  ciFormCompletionBadge,
} from "@/components/cig/CiReferencesFormModal";
import { FieldVisitForm } from "@/components/cig/FieldVisitForm";
import { SmeReloanVerificationForm } from "@/components/cig/SmeReloanVerificationForm";
import { statusBadgeVariant } from "@/lib/applications/status";
import { buildPipelineSteps } from "@/lib/applications/pipeline";
import type { StatusHistoryEntry } from "@/lib/applications/status";
import { tatTone } from "@/lib/committee/votes";
import type {
  PicAddress,
  PicDemeanorTag,
  PicPaymentPreference,
  PicVerification,
  ReferenceVerification,
  VerificationChecklist,
} from "@/lib/cig/verification";
import {
  RESIDENCE_TYPES,
  assessFieldVisitRequired,
  assessSmeReloanRequired,
  type FieldVisit,
  type SmeReloanVerification,
} from "@/lib/cig/field-visit";
import type { BorrowerProfile } from "@/lib/borrowers/types";
import { CSA_ONLY_INTAKE_SLUGS } from "@/lib/documents/csa-only-intake";

type CommitteeDetail = {
  application: {
    id: string;
    applicationNo: string | null;
    status: string;
    statusLabel: string;
    blocker: string | null;
    isReloan: boolean;
    segment: "seafarer" | "sme";
    entityType: "individual" | "corporate" | null;
    statusHistory: StatusHistoryEntry[] | null;
    canDecide: boolean;
    votesNeeded: number;
    committeeSize: number;
    canOverride: boolean;
    canAdjustPreDecision: boolean;
  };
  borrower: BorrowerProfile | null;
  verification: {
    finding: "positive" | "negative" | null;
    findingNotes: string | null;
    forwardedAt: string | null;
    completedAt: string | null;
    fieldCompletenessOk: boolean | null;
    fieldCompletenessNotes: string | null;
    biIdentityConfirmed: boolean | null;
    biPurposeConfirmed: boolean | null;
    biDetailsConfirmed: boolean | null;
    biNotes: string | null;
    cmDepartureDate: string | null;
    cmSalary: number | null;
    cmPosition: string | null;
    cmContractStatus: string | null;
    cmFitToWork: boolean | null;
    cmNotes: string | null;
    cmManagerName: string | null;
    cmManagerPosition: string | null;
    cmManagerContact: string | null;
    cmManningAgencyName: string | null;
    cmJoiningPort: string | null;
    picVerification: PicVerification | null;
    referenceVerifications: ReferenceVerification[] | null;
    verificationChecklist: VerificationChecklist | null;
    picPaymentPreference: PicPaymentPreference | null;
    picDemeanor: PicDemeanorTag[] | null;
    picRating: number | null;
    picRatingReason: string | null;
    cifVerifiedBy: string | null;
    cifVerifiedDate: string | null;
    fieldVisit: FieldVisit | null;
    smeReloanVerification: SmeReloanVerification | null;
  } | null;
  completeness: {
    ready: boolean;
    items: Array<{ label: string; ok: boolean; detail?: string }>;
  };
  assessment: {
    characterNotes: string | null;
    capacityNotes: string | null;
    capitalNotes: string | null;
    conditionsNotes: string | null;
    updatedAt: string;
  } | null;
  computation: {
    id: string;
    inputMode: string;
    inputAmount: number;
    principal: number;
    netReleased: number;
    totalLoan: number;
    monthlyAmortization: number;
    lineItems: Array<{ key: string; label: string; amount: number }>;
    terms: number;
    addonMonths: number;
    signedAt: string | null;
    loanTypeName: string | null;
    coverageRatio: number | null;
    coverageWarning: boolean;
  } | null;
  votes: Array<{
    voterId: string;
    voterName: string | null;
    vote: "approve" | "deny";
    votedAt: string;
    comment: string | null;
  }>;
  tally: {
    approve: number;
    deny: number;
    label: string | null;
    hasMajority: boolean;
  };
  myVote: "approve" | "deny" | null;
  latestAction: {
    action: string;
    comment: string | null;
    actedAt: string;
    actedByName: string | null;
  } | null;
  decisionEmail: {
    sent: boolean;
    lastAttemptAt: string | null;
    lastEmailSent: boolean | null;
    lastFailureReason: string | null;
    borrowerEmail: string | null;
  } | null;
  negotiation: {
    status: string;
    approvedAmount: number | null;
    currentAmount: number | null;
    lastCounterAmount: number | null;
    lastCounterBy: string | null;
  } | null;
  negotiationMessages: NegotiationLogMessage[];
  csaSummary: {
    blocker: string | null;
    endorsedAt: string | null;
    endorsedByName: string | null;
    privacyOrientationAt: string | null;
    privacyOrientationByName: string | null;
    initialInterviewAt: string | null;
    initialInterviewNotes: string | null;
    initialInterviewByName: string | null;
    timeline: Array<{
      status: string;
      label: string;
      at: string;
      note?: string | null;
    }>;
  };
  csaScreening: {
    slug: string;
    name: string | null;
    result: string;
    notes: string | null;
    checkedAt: string | null;
  };
  tatDays: number | null;
};

function formatMoney(value: number) {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function displayText(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

function displayBool(value: boolean | null | undefined): string {
  if (value == null) return "—";
  return value ? "Yes" : "No";
}

function formatAddress(address: PicAddress | null | undefined): string {
  if (!address) return "—";
  const line = [
    address.street,
    address.barangay,
    address.city,
    address.province,
    address.zipCode,
  ]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(", ");
  const meta = [
    address.ownership ? address.ownership : null,
    address.yearsOfStay ? `${address.yearsOfStay} yrs stay` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  if (!line && !meta) return "—";
  return meta ? `${line || "—"} (${meta})` : line;
}

const CHECKLIST_LABELS: Array<{
  key: keyof VerificationChecklist;
  label: string;
}> = [
  { key: "validateBorrowerInfo", label: "Validate Borrower's Information" },
  { key: "validatePicInfo", label: "Validate PIC Information" },
  { key: "presidePicObligationSpill", label: "Preside PIC Obligation / Spill" },
  { key: "verifiedCharacterReferences", label: "Verified Character References" },
];


const KEY_AMOUNT_KEYS = new Set(["principal", "net_released", "netReleased", "total_loan", "totalLoan"]);
const AMORT_KEYS = new Set(["monthly_amortization", "monthlyAmortization"]);

function initialsOf(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p.charAt(0))
    .join("")
    .toUpperCase();
}

const CheckIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const IconClock = (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);
const IconRepeat = (
  <svg {...iconProps}>
    <path d="m17 2 4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="m7 22-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
  </svg>
);
const IconShield = (
  <svg {...iconProps}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
  </svg>
);

const KPI_TONES = {
  navy: { background: "var(--navy-50)", color: "var(--navy-700)" },
  danger: { background: "var(--danger-bg)", color: "var(--danger)" },
  warning: { background: "var(--warning-bg)", color: "var(--warning)" },
  success: { background: "var(--success-bg)", color: "var(--success)" },
  neutral: { background: "var(--surface-2)", color: "var(--ink-400)" },
} as const;

function Kpi({
  tone,
  icon,
  label,
  value,
}: {
  tone: keyof typeof KPI_TONES;
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="kpi flex h-full flex-col">
      <span className="ic" style={KPI_TONES[tone]}>
        {icon}
      </span>
      <div className="k">{label}</div>
      <div className="v">{value}</div>
    </div>
  );
}

export default function CommitteeApplicationPage() {
  const params = useParams();
  const applicationId = params.id as string;

  const [data, setData] = useState<CommitteeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [revisitComment, setRevisitComment] = useState("");
  const [revisitRoute, setRevisitRoute] = useState<"csa" | "cig">("csa");
  const [confirmRevisit, setConfirmRevisit] = useState(false);
  const [confirmAction, setConfirmAction] = useState<
    "approve" | "deny" | "hold" | null
  >(null);
  const [confirmApproveWithoutSign, setConfirmApproveWithoutSign] =
    useState(false);
  const [approvingWithoutSign, setApprovingWithoutSign] = useState(false);
  const [resendOpen, setResendOpen] = useState(false);
  const [resending, setResending] = useState(false);
  const [decisionComment, setDecisionComment] = useState("");
  const [overrideAmount, setOverrideAmount] = useState("");
  const [overrideMode, setOverrideMode] = useState("NET_SARADO");
  const [overrideTerms, setOverrideTerms] = useState("6");
  const [overrideMessage, setOverrideMessage] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [confirmAccept, setConfirmAccept] = useState(false);
  const [voteComment, setVoteComment] = useState("");
  const [showCiForm, setShowCiForm] = useState(false);
  const [showFieldVisitForm, setShowFieldVisitForm] = useState(false);
  const [showApplicationForm, setShowApplicationForm] = useState(false);
  const [assessmentForm, setAssessmentForm] = useState({
    characterNotes: "",
    capacityNotes: "",
    capitalNotes: "",
    conditionsNotes: "",
  });

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/committee/applications/${applicationId}`);
      if (!res.ok) throw new Error("Failed to load application");
      const body = (await res.json()) as CommitteeDetail;
      setData(body);
      if (!opts?.silent) {
        setAssessmentForm({
          characterNotes: body.assessment?.characterNotes ?? "",
          capacityNotes: body.assessment?.capacityNotes ?? "",
          capitalNotes: body.assessment?.capitalNotes ?? "",
          conditionsNotes: body.assessment?.conditionsNotes ?? "",
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleVote(vote: "approve" | "deny") {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(
        `/api/committee/applications/${applicationId}/vote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vote,
            comment: voteComment.trim() || undefined,
          }),
        },
      );
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Vote failed");
      setMessage(`Vote recorded: ${vote}`);
      setVoteComment("");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vote failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleAction(action: "approve" | "deny" | "revisit" | "hold") {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const payload: Record<string, string> = { action };
      if (action === "revisit") {
        payload.comment = revisitComment;
        payload.revisitRoute = revisitRoute;
      }
      if (action === "approve" || action === "deny" || action === "hold") {
        payload.comment = decisionComment;
      }

      const res = await fetch(
        `/api/committee/applications/${applicationId}/action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = (await res.json()) as { error?: string; status?: string };
      if (!res.ok) throw new Error(body.error ?? "Action failed");
      setMessage(`Final action recorded: ${action}`);
      setDecisionComment("");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleApproveWithoutSign() {
    setApprovingWithoutSign(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(
        `/api/committee/applications/${applicationId}/approve-without-sign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            comment: decisionComment.trim() || undefined,
          }),
        },
      );
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Action failed");
      setMessage("Approved, disclosed, and signed in-branch — queued for LRA.");
      setDecisionComment("");
      setConfirmApproveWithoutSign(false);
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setApprovingWithoutSign(false);
    }
  }

  async function handleOverride(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(
        `/api/committee/applications/${applicationId}/override`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: Number(overrideAmount),
            inputMode: overrideMode,
            terms: Number(overrideTerms),
            message: overrideMessage.trim() || undefined,
          }),
        },
      );
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Override failed");
      setMessage(
        data?.application.canAdjustPreDecision
          ? "Amount adjusted — this is what will be approved."
          : "Committee override saved — borrower must re-sign.",
      );
      setOverrideMessage("");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Override failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleAcceptOffer() {
    setAccepting(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(
        `/api/committee/applications/${applicationId}/accept-offer`,
        { method: "POST" },
      );
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Accept failed");
      setMessage(
        "Accepted — queued for LRA. No further borrower confirmation is required.",
      );
      setConfirmAccept(false);
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Accept failed");
    } finally {
      setAccepting(false);
    }
  }

  async function handleSaveAssessment(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(
        `/api/committee/applications/${applicationId}/assessment`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(assessmentForm),
        },
      );
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Save failed");
      setMessage("Assessment notes saved.");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleResendDecisionEmail() {
    if (!applicationId) return;
    setResending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/committee/applications/${applicationId}/decision-email/resend`,
        { method: "POST" },
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        emailSent?: boolean;
      };
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to resend decision email");
      }
      setMessage(
        body.emailSent
          ? "Decision email resent."
          : "Resend attempted but email was not sent. Check borrower email and SMTP.",
      );
      setResendOpen(false);
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resend failed");
    } finally {
      setResending(false);
    }
  }

  if (loading) return <Spinner />;
  if (!data) return <Alert>Application not found.</Alert>;

  const companyName = data.borrower?.businessInfo?.companyName?.trim();
  const borrowerTitle =
    data.application.segment === "sme" && companyName
      ? companyName
      : data.borrower
        ? `${data.borrower.firstName} ${data.borrower.lastName}`
        : "Application";
  // Vote casting & 4 Cs stay available while ballots fill in; final action
  // alone waits for canDecide (all 3 votes — Phase 2).
  const canVote = data.application.status === "for_approval";
  const votesCast = data.votes.length;
  const isCommitteeHold = data.application.status === "committee_hold";
  const holdReason =
    isCommitteeHold && data.latestAction?.action === "hold"
      ? data.latestAction.comment
      : isCommitteeHold
        ? data.latestAction?.comment
        : null;
  const isSme = data.application.segment === "sme";

  return (
    <div>
      <Breadcrumbs
        className="mb-3"
        items={[
          { label: "Committee queue", href: "/committee" },
          { label: borrowerTitle },
        ]}
      />
      <PageHeader
        title={borrowerTitle}
        description={data.application.applicationNo ?? undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isSme ? "navy" : "teal"} dot>
              {isSme ? "SME" : "Seafarer"}
            </Badge>
            <Badge variant={statusBadgeVariant(data.application.status)}>
              {data.application.statusLabel}
            </Badge>
          </div>
        }
      />

      <Card className="mb-6 overflow-x-auto">
        <Stepper steps={buildPipelineSteps(data.application.status)} />
      </Card>

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

      {isCommitteeHold ? (
        <div className="mb-6">
          <Alert variant="danger">
            <b>On hold</b>
            {holdReason
              ? ` — ${holdReason}`
              : " — pending committee review. Resolve with Approve, Deny, or Revisit."}
          </Alert>
        </div>
      ) : null}

      {data.application.blocker ? (
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
          {data.application.blocker}
        </div>
      ) : null}

      <div className="kpi-grid mb-6">
        <Kpi
          tone={tatTone(data.tatDays)}
          icon={IconClock}
          label="TAT since CIG forward"
          value={data.tatDays != null ? `${data.tatDays}d` : "—"}
        />
        <Kpi
          tone={data.application.isReloan ? "navy" : "neutral"}
          icon={IconRepeat}
          label="Borrower history"
          value={data.application.isReloan ? "Reloan" : "First loan"}
        />
        <Kpi
          tone={
            data.verification?.finding === "positive"
              ? "success"
              : data.verification?.finding === "negative"
                ? "danger"
                : "neutral"
          }
          icon={IconShield}
          label="CIG finding"
          value={
            data.verification?.finding === "positive"
              ? "Positive"
              : data.verification?.finding === "negative"
                ? "Negative"
                : "Pending"
          }
        />
      </div>

      <Card className="mb-6 border-l-[3px] !border-l-teal-500 !bg-surface-2/30">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="font-display text-lg font-semibold text-navy-900">
            CSA intake summary
          </h2>
          <Badge variant="neutral">From CSA</Badge>
        </div>
        <p className="mb-4 text-sm text-ink-500">
          Read-only — everything CSA recorded before endorsing this file.
        </p>

        {data.csaSummary.blocker ? (
          <div className="mb-4 rounded-[var(--r-md)] border border-warning/40 bg-warning/10 px-3 py-2.5">
            <p className="text-sm font-medium text-ink-800">
              On hold — {data.csaSummary.blocker}
            </p>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
              Data Privacy Act orientation
            </p>
            {data.csaSummary.privacyOrientationAt ? (
              <p className="mt-1 text-sm text-ink-700">
                Recorded{" "}
                <span className="mono">
                  {new Date(data.csaSummary.privacyOrientationAt).toLocaleString()}
                </span>
                {data.csaSummary.privacyOrientationByName
                  ? ` · ${data.csaSummary.privacyOrientationByName}`
                  : null}
              </p>
            ) : (
              <p className="mt-1 text-sm text-ink-400">Not recorded.</p>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
              {data.csaScreening.name ??
                (data.application.segment === "sme"
                  ? "SME duplication check"
                  : "NCL check")}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <Badge
                variant={
                  data.csaScreening.result === "pass"
                    ? "success"
                    : data.csaScreening.result === "fail"
                      ? "danger"
                      : "neutral"
                }
              >
                {data.csaScreening.result}
              </Badge>
              {data.csaScreening.checkedAt ? (
                <span className="text-xs text-ink-400">
                  {new Date(data.csaScreening.checkedAt).toLocaleDateString()}
                </span>
              ) : null}
            </div>
            {data.csaScreening.notes ? (
              <p className="mt-1 text-sm text-ink-700">{data.csaScreening.notes}</p>
            ) : null}
          </div>

          <div className="sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
              Initial interview
            </p>
            {data.csaSummary.initialInterviewAt ? (
              <>
                <p className="mt-1 text-sm text-ink-700">
                  Recorded{" "}
                  <span className="mono">
                    {new Date(data.csaSummary.initialInterviewAt).toLocaleString()}
                  </span>
                  {data.csaSummary.initialInterviewByName
                    ? ` · ${data.csaSummary.initialInterviewByName}`
                    : null}
                </p>
                {data.csaSummary.initialInterviewNotes ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-600">
                    {data.csaSummary.initialInterviewNotes}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-1 text-sm text-ink-400">Not recorded.</p>
            )}
          </div>

          <div className="sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
              Endorsed to CIG
            </p>
            <p className="mt-1 text-sm text-ink-700">
              {data.csaSummary.endorsedAt
                ? new Date(data.csaSummary.endorsedAt).toLocaleString()
                : "Not yet endorsed"}
              {data.csaSummary.endorsedByName
                ? ` · ${data.csaSummary.endorsedByName}`
                : null}
            </p>
          </div>
        </div>

        {data.csaSummary.timeline.length ? (
          <div className="mt-5 border-t border-line-soft pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
              Status history
            </p>
            <ul className="flex flex-col gap-2">
              {[...data.csaSummary.timeline]
                .reverse()
                .slice(0, 8)
                .map((entry, index) => (
                  <li
                    key={`${entry.status}-${entry.at}-${index}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
                  >
                    <span className="font-medium text-ink-900">
                      {entry.label ?? entry.status}
                      {entry.note ? (
                        <span className="font-normal text-ink-500">
                          {" "}
                          · {entry.note}
                        </span>
                      ) : null}
                    </span>
                    <span className="mono text-xs text-ink-400">
                      {new Date(entry.at).toLocaleString()}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
      </Card>

      {data.borrower ? (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-navy-900">
              Application form
            </h2>
            <p className="text-sm text-ink-500">
              Read-only copy of the credit application filled by the borrower
              or CSA.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowApplicationForm(true)}
          >
            View application form
          </Button>
        </Card>
      ) : null}

      {data.borrower ? (
        <Modal
          open={showApplicationForm}
          title="Application Form"
          onClose={() => setShowApplicationForm(false)}
          className="!max-w-4xl"
        >
          <div className="max-h-[65vh] overflow-y-auto pr-1">
            <ApplicantProfileFields
              profile={data.borrower}
              segment={data.application.segment}
              entityType={data.application.entityType}
              readOnly
            />
          </div>
        </Modal>
      ) : null}

      <Card className="mb-6">
        <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
          Completeness review
        </h2>
        <p className="mb-4 text-sm text-ink-500">
          Confirm the file is complete — IDs, income proof, contracts, and a
          finished CIG verification — before deliberating.
        </p>
        <div className="chk-list chk-list--page !max-w-none">
          {data.completeness.items.map((item) => (
            <div key={item.label} className={`ci ${item.ok ? "ok" : "miss"}`}>
              <span className="st">{item.ok ? CheckIcon : "·"}</span>
              <div className="min-w-0 leading-snug">
                <b>{item.label}</b>
                <span>{item.detail ?? (item.ok ? "Complete" : "Missing")}</span>
              </div>
            </div>
          ))}
        </div>
        {!data.completeness.ready ? (
          <p className="mt-3 text-xs text-ink-400">
            Something missing or suspicious? Use Notice to Revisit below
            instead of deciding on an incomplete file.
          </p>
        ) : null}
      </Card>

      {data.verification ? (
        <Card className="mb-6">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg font-semibold text-navy-900">
                  CI Report
                </h2>
                <Badge variant="neutral">From CIG</Badge>
              </div>
              <p className="text-sm text-ink-500">
                Credit Investigation Group&apos;s full verification record — read
                this before voting.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {data.application.segment !== "sme" ? (
                <>
                  <Badge variant={ciFormCompletionBadge(data.verification).variant}>
                    {ciFormCompletionBadge(data.verification).label}
                  </Badge>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowCiForm(true)}
                  >
                    View full CI &amp; References Form
                  </Button>
                </>
              ) : (
                <>
                  <Badge
                    variant={
                      (data.application.isReloan
                        ? assessSmeReloanRequired(
                            data.verification.smeReloanVerification,
                          )
                        : assessFieldVisitRequired(data.verification.fieldVisit)
                      ).complete
                        ? "success"
                        : "warning"
                    }
                  >
                    {(data.application.isReloan
                      ? assessSmeReloanRequired(
                          data.verification.smeReloanVerification,
                        )
                      : assessFieldVisitRequired(data.verification.fieldVisit)
                    ).complete
                      ? "Complete"
                      : "In progress"}
                  </Badge>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowFieldVisitForm(true)}
                  >
                    {data.application.isReloan
                      ? "View full SME re-loan Form"
                      : "View full Field Visit Form"}
                  </Button>
                </>
              )}
            </div>
          </div>
          {data.verification.finding ? (
            <Badge
              variant={data.verification.finding === "positive" ? "success" : "danger"}
            >
              {data.verification.finding === "positive"
                ? "Positive finding"
                : "Negative finding"}
            </Badge>
          ) : (
            <Badge variant="neutral">Not yet recorded</Badge>
          )}
          {data.verification.findingNotes ? (
            <p className="mt-3 text-sm text-ink-700">
              {data.verification.findingNotes}
            </p>
          ) : null}
          {data.verification.forwardedAt ? (
            <p className="mt-2 text-xs text-ink-400">
              Forwarded by CIG{" "}
              <span className="mono">
                {new Date(data.verification.forwardedAt).toLocaleString()}
              </span>
            </p>
          ) : null}

          <div className="mt-4 grid gap-4 border-t border-line-soft pt-4 sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                Field completeness
              </div>
              <p className="mt-1 text-sm text-ink-700">
                {displayBool(data.verification.fieldCompletenessOk)}
              </p>
              {data.verification.fieldCompletenessNotes ? (
                <p className="mt-1 text-xs text-ink-400">
                  {data.verification.fieldCompletenessNotes}
                </p>
              ) : null}
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                Borrower interview
              </div>
              <p className="mt-1 text-sm text-ink-700">
                {data.verification.biNotes || "No notes recorded."}
              </p>
              <p className="mt-1 text-xs text-ink-400">
                Identity {data.verification.biIdentityConfirmed ? "confirmed" : "not confirmed"}
                {" · "}Purpose {data.verification.biPurposeConfirmed ? "confirmed" : "not confirmed"}
                {" · "}Details {data.verification.biDetailsConfirmed ? "confirmed" : "not confirmed"}
              </p>
            </div>
          </div>

          {data.application.segment !== "sme" ? (
            <>
          <div className="mt-4 border-t border-line-soft pt-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Crewing manager
            </div>
            <div className="mt-2 grid gap-x-4 gap-y-1 text-sm text-ink-700 sm:grid-cols-2">
              <p>
                <span className="text-ink-400">Position:</span>{" "}
                {displayText(data.verification.cmPosition)}
              </p>
              <p>
                <span className="text-ink-400">Contract status:</span>{" "}
                {displayText(data.verification.cmContractStatus)}
              </p>
              <p>
                <span className="text-ink-400">Departure:</span>{" "}
                {data.verification.cmDepartureDate
                  ? new Date(data.verification.cmDepartureDate).toLocaleDateString()
                  : "—"}
              </p>
              <p>
                <span className="text-ink-400">Salary:</span>{" "}
                {data.verification.cmSalary != null
                  ? `₱${formatMoney(data.verification.cmSalary)}`
                  : "—"}
              </p>
              <p>
                <span className="text-ink-400">Fit to work:</span>{" "}
                {displayBool(data.verification.cmFitToWork)}
              </p>
              <p>
                <span className="text-ink-400">Crewing manager:</span>{" "}
                {displayText(data.verification.cmManagerName)}
                {data.verification.cmManagerPosition
                  ? ` (${data.verification.cmManagerPosition})`
                  : ""}
              </p>
              <p>
                <span className="text-ink-400">CM contact:</span>{" "}
                {displayText(data.verification.cmManagerContact)}
              </p>
              <p>
                <span className="text-ink-400">Manning agency:</span>{" "}
                {displayText(data.verification.cmManningAgencyName)}
              </p>
              <p>
                <span className="text-ink-400">Joining port:</span>{" "}
                {displayText(data.verification.cmJoiningPort)}
              </p>
            </div>
            {data.verification.cmNotes ? (
              <p className="mt-2 text-sm text-ink-700">{data.verification.cmNotes}</p>
            ) : null}
          </div>

          {/* CI & References Form summary + full modal (CI AND REFERENCES FORM 1) */}
          <div className="mt-4 border-t border-line-soft pt-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                CI &amp; References Form 1 — PIC verification
              </div>
            </div>
            {data.verification.picVerification ? (
              <div className="mt-2 grid gap-x-4 gap-y-1 text-sm text-ink-700 sm:grid-cols-2">
                <p>
                  <span className="text-ink-400">Name:</span>{" "}
                  {displayText(data.verification.picVerification.name)}
                </p>
                <p>
                  <span className="text-ink-400">Birthday:</span>{" "}
                  {displayText(data.verification.picVerification.birthday)}
                </p>
                <p>
                  <span className="text-ink-400">Relation to client:</span>{" "}
                  {displayText(data.verification.picVerification.relationToClient)}
                </p>
                <p>
                  <span className="text-ink-400">Since when:</span>{" "}
                  {displayText(data.verification.picVerification.sinceWhen)}
                </p>
                <p>
                  <span className="text-ink-400">Contact number:</span>{" "}
                  {displayText(data.verification.picVerification.contactNumber)}
                </p>
                <p>
                  <span className="text-ink-400">Other number:</span>{" "}
                  {displayText(data.verification.picVerification.otherNumber)}
                </p>
                <p>
                  <span className="text-ink-400">Email:</span>{" "}
                  {displayText(data.verification.picVerification.email)}
                </p>
                <p>
                  <span className="text-ink-400">Facebook/Skype/Viber:</span>{" "}
                  {displayText(data.verification.picVerification.socialContact)}
                </p>
                <p className="sm:col-span-2">
                  <span className="text-ink-400">Present address:</span>{" "}
                  {formatAddress(data.verification.picVerification.presentAddress)}
                </p>
                <p className="sm:col-span-2">
                  <span className="text-ink-400">Provincial address:</span>{" "}
                  {formatAddress(data.verification.picVerification.provincialAddress)}
                </p>
                <p>
                  <span className="text-ink-400">Work:</span>{" "}
                  {[
                    data.verification.picVerification.companyName,
                    data.verification.picVerification.companyYearsOfStay,
                    data.verification.picVerification.companyPhone,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
                <p>
                  <span className="text-ink-400">Aware of loan:</span>{" "}
                  {displayBool(data.verification.picVerification.willAvailLoanAware)}
                </p>
                <div>
                  <span className="text-ink-400">Other financing:</span>{" "}
                  {data.verification.picVerification.otherFinancing?.hasOther == null
                    ? "—"
                    : data.verification.picVerification.otherFinancing.hasOther
                      ? null
                      : "No"}
                  {data.verification.picVerification.otherFinancing?.hasOther &&
                  (data.verification.picVerification.otherFinancing.entries?.length ?? 0) > 0 ? (
                    <ul className="mt-1 space-y-0.5">
                      {data.verification.picVerification.otherFinancing.entries!.map(
                        (entry, i) => (
                          <li key={i} className="text-sm">
                            {[
                              entry.company,
                              entry.loanAmount != null
                                ? `₱${formatMoney(entry.loanAmount)}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ") || `Loan ${i + 1}`}
                          </li>
                        ),
                      )}
                    </ul>
                  ) : data.verification.picVerification.otherFinancing?.hasOther ? (
                    "Yes"
                  ) : null}
                </div>
                <p>
                  <span className="text-ink-400">Housing / car loan:</span>{" "}
                  {[
                    data.verification.picVerification.housingLoan?.has
                      ? "Housing"
                      : null,
                    data.verification.picVerification.carLoan?.has ? "Car" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "None recorded"}
                </p>
                {(data.verification.picVerification.siblings?.length ?? 0) > 0 ? (
                  <div className="sm:col-span-2">
                    <span className="text-ink-400">Siblings:</span>
                    <ul className="mt-1 list-disc pl-5 text-sm">
                      {data.verification.picVerification.siblings!.map((s, i) => (
                        <li key={i}>
                          {[s.name, s.age ? `${s.age} yrs` : null, s.occupation]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p>
                    <span className="text-ink-400">Siblings:</span> None recorded
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-1 text-sm text-ink-400">Not recorded.</p>
            )}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {(data.verification.referenceVerifications?.length
                ? data.verification.referenceVerifications
                : [null, null]
              ).map((ref, i) => (
                <div key={i}>
                  <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                    Reference {i + 1}
                  </div>
                  {ref ? (
                    <div className="mt-1 space-y-0.5 text-sm text-ink-700">
                      <p>
                        {displayText(ref.name)}
                        {ref.age ? ` · ${ref.age} yrs` : ""}
                      </p>
                      <p className="text-xs text-ink-400">
                        {[ref.relationToClient, ref.work, ref.contactNumber]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                      <p className="text-xs text-ink-400">
                        Knows client: {displayText(ref.howLongKnowClient)}
                        {" · "}First time as ref:{" "}
                        {displayBool(ref.firstTimeAsReference)}
                      </p>
                      {ref.otherContactNumber || ref.facebookAccount ? (
                        <p className="text-xs text-ink-400">
                          {[ref.otherContactNumber, ref.facebookAccount]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      ) : null}
                      {ref.remarks ? (
                        <p className="mt-1 text-xs text-ink-500">{ref.remarks}</p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-ink-400">Not recorded.</p>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Verification checklist
                </div>
                {data.verification.verificationChecklist ? (
                  <ul className="mt-1 space-y-1 text-sm text-ink-700">
                    {CHECKLIST_LABELS.map(({ key, label }) => (
                      <li key={key}>
                        {data.verification!.verificationChecklist![key]
                          ? "✓"
                          : "○"}{" "}
                        {label}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-ink-400">Not recorded.</p>
                )}
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  PIC preferred payment
                </div>
                <p className="mt-1 text-sm text-ink-700">
                  {data.verification.picPaymentPreference?.method || "—"}
                  {data.verification.picPaymentPreference?.bankSpecify
                    ? ` · ${data.verification.picPaymentPreference.bankSpecify}`
                    : ""}
                  {data.verification.picPaymentPreference?.othersSpecify
                    ? ` · ${data.verification.picPaymentPreference.othersSpecify}`
                    : ""}
                </p>
                {data.verification.picPaymentPreference?.remarks ? (
                  <p className="mt-1 text-xs text-ink-400">
                    {data.verification.picPaymentPreference.remarks}
                  </p>
                ) : null}
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  PIC rating
                </div>
                <p className="mt-1 text-sm text-ink-700">
                  {data.verification.picRating != null
                    ? `${data.verification.picRating} / 5`
                    : "—"}
                  {data.verification.picDemeanor?.length
                    ? ` · ${data.verification.picDemeanor.join(", ")}`
                    : ""}
                </p>
                {data.verification.picRatingReason ? (
                  <p className="mt-1 text-xs text-ink-400">
                    {data.verification.picRatingReason}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-ink-400">
                  Verified by {displayText(data.verification.cifVerifiedBy)}
                  {data.verification.cifVerifiedDate
                    ? ` · ${data.verification.cifVerifiedDate}`
                    : ""}
                </p>
              </div>
            </div>
          </div>
            </>
          ) : (
            <div className="mt-4 border-t border-line-soft pt-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  {data.application.isReloan
                    ? "SME re-loan verification"
                    : "SME Field Visit"}
                </div>
              </div>
              {data.application.isReloan ? (
                data.verification.smeReloanVerification ? (
                  <div className="mt-2 grid gap-x-4 gap-y-1 text-sm text-ink-700 sm:grid-cols-2">
                    <p>
                      <span className="text-ink-400">Date visited:</span>{" "}
                      {displayText(
                        data.verification.smeReloanVerification.header?.dateVisited,
                      )}
                    </p>
                    <p>
                      <span className="text-ink-400">Visited by:</span>{" "}
                      {displayText(
                        data.verification.smeReloanVerification.header?.visitedBy,
                      )}
                    </p>
                    <p>
                      <span className="text-ink-400">Residence type:</span>{" "}
                      {displayText(
                        data.verification.smeReloanVerification.residence?.typeOfResidence,
                      )}
                    </p>
                    <p>
                      <span className="text-ink-400">Business condition:</span>{" "}
                      {displayText(
                        data.verification.smeReloanVerification.business?.condition,
                      )}
                    </p>
                    <p>
                      <span className="text-ink-400">Risk:</span>{" "}
                      {displayText(data.verification.smeReloanVerification.risk)}
                    </p>
                    <p>
                      <span className="text-ink-400">Recommendation:</span>{" "}
                      {displayText(
                        data.verification.smeReloanVerification.recommendation,
                      )}
                    </p>
                    <p>
                      <span className="text-ink-400">Net income / month:</span>{" "}
                      {data.verification.smeReloanVerification.baseOnFs
                        ?.netIncomePerMonth != null
                        ? `₱${formatMoney(
                            data.verification.smeReloanVerification.baseOnFs
                              .netIncomePerMonth,
                          )}`
                        : "—"}
                    </p>
                    <p>
                      <span className="text-ink-400">Verified by:</span>{" "}
                      {displayText(data.verification.smeReloanVerification.verifiedBy)}
                    </p>
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-ink-400">Not recorded.</p>
                )
              ) : data.verification.fieldVisit ? (
                <div className="mt-2 grid gap-x-4 gap-y-1 text-sm text-ink-700 sm:grid-cols-2">
                  <p>
                    <span className="text-ink-400">Date visited:</span>{" "}
                    {displayText(data.verification.fieldVisit.header?.dateVisited)}
                  </p>
                  <p>
                    <span className="text-ink-400">Visited by:</span>{" "}
                    {displayText(data.verification.fieldVisit.header?.visitedBy)}
                  </p>
                  <p>
                    <span className="text-ink-400">Client:</span>{" "}
                    {displayText(data.verification.fieldVisit.header?.clientName)}
                  </p>
                  <p>
                    <span className="text-ink-400">Residence type:</span>{" "}
                    {data.verification.fieldVisit.residence?.residenceType
                      ? RESIDENCE_TYPES.find(
                          (t) =>
                            t.id ===
                            data.verification!.fieldVisit!.residence!.residenceType,
                        )?.label ??
                        data.verification.fieldVisit.residence.residenceType
                      : "—"}
                  </p>
                  <p>
                    <span className="text-ink-400">Credit realization risk:</span>{" "}
                    {displayText(
                      data.verification.fieldVisit.recommendation?.creditRealizationRisk,
                    )}
                  </p>
                  <p>
                    <span className="text-ink-400">Recommendation:</span>{" "}
                    {data.verification.fieldVisit.recommendation?.recommendation ===
                    "for_approval"
                      ? "For approval"
                      : data.verification.fieldVisit.recommendation?.recommendation ===
                          "for_disapproval"
                        ? "For disapproval"
                        : "—"}
                  </p>
                  <p>
                    <span className="text-ink-400">Prepared by:</span>{" "}
                    {displayText(
                      data.verification.fieldVisit.recommendation?.preparedBy,
                    )}
                  </p>
                </div>
              ) : (
                <p className="mt-1 text-sm text-ink-400">Not recorded.</p>
              )}
            </div>
          )}
        </Card>
      ) : null}

      {data.verification && showCiForm && data.application.segment !== "sme" ? (
        <CiReferencesFormModal
          open={showCiForm}
          onClose={() => setShowCiForm(false)}
          borrower={null}
          saved={data.verification}
          onSave={async () => undefined}
          saving={false}
          readOnly
          verifierName=""
        />
      ) : null}

      {data.verification && showFieldVisitForm && data.application.segment === "sme" ? (
        <Modal
          open={showFieldVisitForm}
          onClose={() => setShowFieldVisitForm(false)}
          title={
            data.application.isReloan ? "SME re-loan verification" : "SME Field Visit"
          }
          className="!max-w-4xl"
        >
          <div className="max-h-[65vh] overflow-y-auto pr-1">
            {data.application.isReloan ? (
              <SmeReloanVerificationForm
                value={data.verification.smeReloanVerification}
                onChange={() => undefined}
                onSave={() => undefined}
                verifierName=""
                readOnly
              />
            ) : (
              <FieldVisitForm
                value={data.verification.fieldVisit}
                onChange={() => undefined}
                onSave={() => undefined}
                verifierName=""
                readOnly
              />
            )}
          </div>
        </Modal>
      ) : null}

      {data.borrower ? (
        <DocumentChecklist
          applicationId={applicationId}
          borrowerId={data.borrower.id}
          stage="intake"
          readOnly
          checklistApiPath={`/api/committee/applications/${applicationId}/checklist`}
          viewApiPath={(documentId) => `/api/documents/${documentId}/download`}
          title="Borrower attachments"
          description={
            data.application.segment === "sme"
              ? "Read-only — business registration, permits, financial statements, and other intake files uploaded by the borrower."
              : "Read-only — Passport, Seaman's Book, Contract, IDs, and House Sketch uploaded by the borrower."
          }
          excludeSlugs={CSA_ONLY_INTAKE_SLUGS}
        />
      ) : null}

      {data.borrower ? (
        <DocumentChecklist
          applicationId={applicationId}
          borrowerId={data.borrower.id}
          stage="intake"
          readOnly
          checklistApiPath={`/api/committee/applications/${applicationId}/checklist`}
          viewApiPath={(documentId) => `/api/documents/${documentId}/download`}
          title="CSA attachments"
          description="Read-only — signed in person at the branch and uploaded by CSA on the borrower's behalf."
          includeSlugs={CSA_ONLY_INTAKE_SLUGS}
        />
      ) : null}

      {data.computation?.coverageRatio != null ? (
        <Card className="mb-6">
          <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
            Affordability check
          </h2>
          <p className="mb-4 text-sm text-ink-500">
            Monthly amortization as a share of the borrower&apos;s declared income.
          </p>
          <div className="score" style={{ margin: "0 auto" }}>
            <div className="val">
              {(data.computation.coverageRatio * 100).toFixed(1)}%
            </div>
            <div
              className="cat"
              style={{
                color: data.computation.coverageWarning
                  ? "var(--danger)"
                  : "var(--success)",
              }}
            >
              {data.computation.coverageWarning
                ? "Exceeds 35% threshold"
                : "Within safe limit"}
            </div>
            <div className="bands">
              <i style={{ background: "var(--success)" }} />
              <i style={{ background: "var(--teal-500)" }} />
              <i style={{ background: "var(--warning)" }} />
              <i style={{ background: "var(--danger)" }} />
            </div>
            <div className="needle-track">
              <span
                className="needle"
                style={{
                  left: `${Math.min((data.computation.coverageRatio / 0.6) * 100, 100)}%`,
                }}
              />
            </div>
            <div className="band-lbls">
              <span>SAFE</span>
              <span>MODERATE</span>
              <span>CAUTION</span>
              <span>OVER LIMIT</span>
            </div>
          </div>
        </Card>
      ) : null}

      {data.computation ? (
        <div className="mb-6">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-semibold text-navy-900">
              Computation
            </h2>
            <Badge variant="neutral">From CSA</Badge>
          </div>
          <p className="mb-3 text-sm text-ink-500">
            {data.computation.loanTypeName ?? "Loan"} ·{" "}
            {data.computation.inputMode.replace(/_/g, " ")}
          </p>
          <div className="card emi !max-w-none" style={{ gridTemplateColumns: "1fr" }}>
            <div className="out">
              <div>
                <div className="ok">Monthly amortization</div>
                <div className="ov" style={{ color: "var(--teal-400)" }}>
                  ₱{formatMoney(data.computation.monthlyAmortization)}
                </div>
              </div>
              {data.computation.lineItems
                .filter((item) => !AMORT_KEYS.has(item.key))
                .map((item) => {
                  const isKey = KEY_AMOUNT_KEYS.has(item.key);
                  return (
                    <div key={item.key} className="row2">
                      <span>{item.label}</span>
                      <b style={isKey ? { color: "var(--teal-400)" } : undefined}>
                        {formatMoney(item.amount)}
                      </b>
                    </div>
                  );
                })}
              <div className="row2" style={{ borderTop: "1px dashed rgba(255,255,255,.2)" }}>
                <span className="flex items-center gap-2">
                  <i
                    className="dot"
                    style={{
                      background: data.computation.signedAt
                        ? "var(--success)"
                        : "var(--warning)",
                    }}
                  />
                  {data.computation.signedAt ? "Signed by borrower" : "Awaiting signature"}
                </span>
                {data.computation.signedAt ? (
                  <b className="font-normal text-navy-200" style={{ fontSize: 11.5 }}>
                    {new Date(data.computation.signedAt).toLocaleDateString()}
                  </b>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {data.application.canAdjustPreDecision ||
      (data.application.canOverride && data.negotiation) ? (
        <Card className="mb-6">
          <h2 className="mb-2 font-display text-lg font-semibold text-navy-900">
            {data.application.canAdjustPreDecision
              ? "Adjust amount before deciding"
              : "Negotiation override"}
          </h2>
          <p className="mb-4 text-sm text-ink-500">
            {data.application.canAdjustPreDecision ? (
              "Committee has full authority to change the requested amount and terms — this becomes the approved amount."
            ) : (
              <>
                Borrower counter:{" "}
                {data.negotiation?.lastCounterAmount != null ? (
                  <span className="mono font-bold text-teal-600">
                    {formatMoney(data.negotiation.lastCounterAmount)}
                  </span>
                ) : (
                  "—"
                )}
              </>
            )}
          </p>

          {!data.application.canAdjustPreDecision &&
          data.negotiation?.lastCounterAmount != null ? (
            <div className="mb-4 rounded-[var(--r-md)] border border-line-soft bg-surface-2/60 p-3">
              <p className="mb-2 text-sm text-ink-700">
                Agree to the borrower&apos;s exact amount — Committee&apos;s
                acceptance is final. This skips a separate borrower signature
                and queues the file for LRA immediately.
              </p>
              <Button
                type="button"
                variant="accent"
                loading={accepting}
                onClick={() => setConfirmAccept(true)}
              >
                Accept {formatMoney(data.negotiation.lastCounterAmount)}
              </Button>
              <ConfirmDialog
                open={confirmAccept}
                title="Accept borrower's offer?"
                message={
                  <>
                    Accept{" "}
                    <span className="mono font-bold text-teal-600">
                      {formatMoney(data.negotiation.lastCounterAmount)}
                    </span>{" "}
                    as final? The borrower will not need to sign again — this
                    queues the file for LRA immediately. This cannot be
                    undone.
                  </>
                }
                confirmLabel="Yes, accept"
                cancelLabel="Cancel"
                loading={accepting}
                onConfirm={() => void handleAcceptOffer()}
                onCancel={() => setConfirmAccept(false)}
              />
            </div>
          ) : null}

          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
            {data.application.canAdjustPreDecision
              ? null
              : "Or override with a different amount"}
          </p>
          <form onSubmit={(e) => void handleOverride(e)} className="space-y-3">
            <div>
              <Label htmlFor="overrideAmount" required>
                Override amount
              </Label>
              <div className="affix">
                <span className="add">₱</span>
                <Input
                  id="overrideAmount"
                  type="number"
                  step="0.01"
                  value={overrideAmount}
                  onChange={(e) => setOverrideAmount(e.target.value)}
                  required
                  mono
                />
              </div>
            </div>
            <div>
              <Label htmlFor="overrideMode">Input mode</Label>
              <Select
                id="overrideMode"
                value={overrideMode}
                onChange={(e) => setOverrideMode(e.target.value)}
              >
                <option value="NET_SARADO">Net Sarado</option>
                <option value="NET_LESS_SECURITY">Net Less Security</option>
                <option value="PRINCIPAL">Principal</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="overrideTerms" required>
                Terms (months)
              </Label>
              <Input
                id="overrideTerms"
                type="number"
                value={overrideTerms}
                onChange={(e) => setOverrideTerms(e.target.value)}
                required
                className="mono"
              />
            </div>
            {!data.application.canAdjustPreDecision ? (
              <div>
                <Label htmlFor="overrideMessage">Note (optional)</Label>
                <Textarea
                  id="overrideMessage"
                  rows={2}
                  value={overrideMessage}
                  onChange={(e) => setOverrideMessage(e.target.value)}
                  placeholder="Explain the override to the borrower…"
                />
              </div>
            ) : null}
            <Button type="submit" loading={saving}>
              {data.application.canAdjustPreDecision
                ? "Adjust amount"
                : "Apply override & send to borrower"}
            </Button>
          </form>
        </Card>
      ) : null}

      {data.negotiation ? (
        <NegotiationLog
          messages={data.negotiationMessages}
          viewerRole="committee"
          canPost={data.application.canOverride}
          onPost={async (body) => {
            const res = await fetch(
              `/api/committee/applications/${applicationId}/negotiation-messages`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ body }),
              },
            );
            if (!res.ok) {
              const errBody = (await res.json().catch(() => null)) as {
                error?: string;
              } | null;
              throw new Error(errBody?.error ?? "Failed to send");
            }
            await load({ silent: true });
          }}
        />
      ) : null}

      <Card className="mb-6">
        <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
          Votes
        </h2>
        <p className="mb-4 text-sm text-ink-500">
          Informational straw poll — the binding decision is the final action
          below.
        </p>

        <div
          className="mb-4 rounded-[var(--r-lg)] p-5 text-center"
          style={{
            background: data.tally.hasMajority
              ? data.tally.approve > data.tally.deny
                ? "var(--success-bg)"
                : "var(--danger-bg)"
              : "var(--surface-2)",
          }}
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            Tally
          </div>
          <div
            className="mono mt-1 text-[32px] font-bold"
            style={{
              color: data.tally.hasMajority
                ? data.tally.approve > data.tally.deny
                  ? "var(--success)"
                  : "var(--danger)"
                : "var(--ink-500)",
            }}
          >
            {data.tally.label ??
              `${data.tally.approve}/${data.application.committeeSize} approve · ${data.tally.deny}/${data.application.committeeSize} deny`}
          </div>
        </div>

        {data.votes.length ? (
          <div className="mb-4 space-y-3">
            {data.votes.map((v) => (
              <div key={v.voterId} className="person">
                <Avatar
                  initials={initialsOf(v.voterName)}
                  size="sm"
                  teal={v.vote === "approve"}
                />
                <span className="min-w-0">
                  <span className="nm block">{v.voterName ?? "Unknown staff"}</span>
                  <span className="sub2 block">
                    Voted {v.vote} ·{" "}
                    <span className="mono">
                      {new Date(v.votedAt).toLocaleString()}
                    </span>
                  </span>
                  {v.comment ? (
                    <span className="mt-1 block text-sm text-ink-700">
                      {v.comment}
                    </span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mb-4 text-sm text-ink-500">No votes cast yet.</p>
        )}

        {canVote ? (
          <div className="border-t border-line-soft pt-4">
            <p className="mb-3 text-sm text-ink-500">
              {data.myVote ? `You voted: ${data.myVote}` : "Cast your vote."}
            </p>
            <div className="mb-3">
              <Label htmlFor="voteComment">Remarks (optional)</Label>
              <Textarea
                id="voteComment"
                value={voteComment}
                onChange={(e) => setVoteComment(e.target.value)}
                placeholder="Note for the other members…"
                rows={2}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="accent"
                loading={saving}
                onClick={() => void handleVote("approve")}
              >
                Vote Approve
              </Button>
              <Button
                variant="danger-soft"
                loading={saving}
                onClick={() => void handleVote("deny")}
              >
                Vote Deny
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      {canVote ? (
        <Card className="mb-6">
          <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
            4 Cs assessment
          </h2>
          <p className="mb-4 text-sm text-ink-500">
            Shared deliberation notes — Character, Capacity, Capital,
            Conditions. Informational only, not required to decide.
          </p>
          <form onSubmit={(e) => void handleSaveAssessment(e)} className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="characterNotes">Character</Label>
              <Textarea
                id="characterNotes"
                value={assessmentForm.characterNotes}
                onChange={(e) =>
                  setAssessmentForm({ ...assessmentForm, characterNotes: e.target.value })
                }
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="capacityNotes">Capacity</Label>
              <Textarea
                id="capacityNotes"
                value={assessmentForm.capacityNotes}
                onChange={(e) =>
                  setAssessmentForm({ ...assessmentForm, capacityNotes: e.target.value })
                }
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="capitalNotes">Capital</Label>
              <Textarea
                id="capitalNotes"
                value={assessmentForm.capitalNotes}
                onChange={(e) =>
                  setAssessmentForm({ ...assessmentForm, capitalNotes: e.target.value })
                }
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="conditionsNotes">Conditions</Label>
              <Textarea
                id="conditionsNotes"
                value={assessmentForm.conditionsNotes}
                onChange={(e) =>
                  setAssessmentForm({ ...assessmentForm, conditionsNotes: e.target.value })
                }
                rows={3}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" variant="secondary" loading={saving}>
                Save assessment
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {data.application.canDecide ? (
          <Card className="mb-6">
            <h2 className="mb-4 font-display text-lg font-semibold text-navy-900">
              Final action
            </h2>
            <p className="mb-3 text-sm text-ink-500">
              Final actions are binding and recorded on the file — you will be
              asked to confirm.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                loading={saving}
                disabled={!data.borrower?.userId}
                onClick={() => setConfirmAction("approve")}
              >
                Approve loan
              </Button>
              <Button
                variant="danger"
                loading={saving}
                onClick={() => setConfirmAction("deny")}
              >
                Deny loan
              </Button>
              {!isCommitteeHold ? (
                <Button
                  variant="secondary"
                  loading={saving}
                  onClick={() => setConfirmAction("hold")}
                >
                  Hold
                </Button>
              ) : null}
              {!data.borrower?.userId ? (
                <Button
                  type="button"
                  variant="outline"
                  loading={approvingWithoutSign}
                  onClick={() => setConfirmApproveWithoutSign(true)}
                >
                  Approve without borrower&apos;s sign
                </Button>
              ) : null}
            </div>
            {!data.borrower?.userId ? (
              <p className="mt-2 text-xs text-ink-400">
                Borrower has no portal account — use &ldquo;Approve without
                borrower&apos;s sign&rdquo; instead of plain Approve.
              </p>
            ) : null}

            <ConfirmDialog
              open={confirmApproveWithoutSign}
              title="Approve without borrower's sign?"
              message="Approves the loan, discloses the terms, and signs the computation in-branch on the borrower's behalf, all in one step — skipping CSA's separate disclose click and the borrower's own portal signature. Only use this when the borrower has no portal account and has approved the terms in person. This queues the file for LRA immediately."
              confirmLabel="Yes, approve and proceed to LRA"
              cancelLabel="Cancel"
              variant="accent"
              loading={approvingWithoutSign}
              onConfirm={() => void handleApproveWithoutSign()}
              onCancel={() => setConfirmApproveWithoutSign(false)}
            />

            <ConfirmDialog
              open={confirmAction !== null}
              title={`Committee decision — ${data.application.applicationNo ?? borrowerTitle}`}
              confirmLabel={
                confirmAction === "approve"
                  ? "Yes, approve"
                  : confirmAction === "hold"
                    ? "Yes, hold"
                    : "Yes, deny"
              }
              variant={
                confirmAction === "approve"
                  ? "accent"
                  : confirmAction === "hold"
                    ? "primary"
                    : "danger"
              }
              loading={saving}
              confirmDisabled={
                (confirmAction === "deny" || confirmAction === "hold") &&
                !decisionComment.trim()
              }
              onCancel={() => {
                setConfirmAction(null);
                setDecisionComment("");
              }}
              onConfirm={() => {
                if (!confirmAction) return;
                if (
                  (confirmAction === "deny" || confirmAction === "hold") &&
                  !decisionComment.trim()
                ) {
                  return;
                }
                void handleAction(confirmAction).then(() =>
                  setConfirmAction(null),
                );
              }}
            >
              <div className="kv mb-4">
                <div className="row">
                  <span className="k">Borrower</span>
                  <span className="v">{borrowerTitle}</span>
                </div>
                <div className="row">
                  <span className="k">Net released</span>
                  <span className="v mono">
                    {data.computation
                      ? `₱${formatMoney(data.computation.netReleased)}`
                      : "—"}
                  </span>
                </div>
                <div className="row">
                  <span className="k">CIG recommendation</span>
                  <span className="v">
                    {data.verification?.finding ? (
                      <Badge
                        variant={
                          data.verification.finding === "positive"
                            ? "success"
                            : "danger"
                        }
                      >
                        {data.verification.finding === "positive"
                          ? "Favorable"
                          : "Unfavorable"}
                      </Badge>
                    ) : (
                      <Badge variant="neutral">Not recorded</Badge>
                    )}
                  </span>
                </div>
              </div>
              <Label htmlFor="decisionComment">
                Remarks
                {confirmAction === "deny" || confirmAction === "hold" ? (
                  <>
                    {" "}
                    <span className="req">*</span>{" "}
                    <span style={{ fontWeight: 400, color: "var(--ink-400)" }}>
                      {confirmAction === "hold"
                        ? "(required when holding)"
                        : "(required when denying)"}
                    </span>
                  </>
                ) : null}
              </Label>
              <Textarea
                id="decisionComment"
                value={decisionComment}
                onChange={(e) => setDecisionComment(e.target.value)}
                placeholder="Basis for your decision…"
                rows={3}
              />
            </ConfirmDialog>

            <form
              className="mt-6 space-y-3 border-t border-line-soft pt-4"
              onSubmit={(e) => {
                e.preventDefault();
                setConfirmRevisit(true);
              }}
            >
              <h3 className="font-medium text-ink-900">Notice to Revisit</h3>
              <Label htmlFor="revisitRoute">Route to</Label>
              <Select
                id="revisitRoute"
                value={revisitRoute}
                onChange={(e) =>
                  setRevisitRoute(e.target.value as "csa" | "cig")
                }
              >
                <option value="csa">CSA (intake)</option>
                <option value="cig">CIG (verification)</option>
              </Select>
              <Label htmlFor="revisitComment" required>
                Comment (required)
              </Label>
              <Textarea
                id="revisitComment"
                value={revisitComment}
                onChange={(e) => setRevisitComment(e.target.value)}
                rows={3}
                required
              />
              <Button
                type="submit"
                variant="secondary"
                loading={saving}
                disabled={!revisitComment.trim()}
              >
                Send Notice to Revisit
              </Button>
            </form>
            <ConfirmDialog
              open={confirmRevisit}
              title="Send Notice to Revisit?"
              variant="primary"
              confirmLabel="Yes, send"
              onCancel={() => setConfirmRevisit(false)}
              onConfirm={() => {
                void handleAction("revisit").then(() => setConfirmRevisit(false));
              }}
              loading={saving}
            >
              <div className="kv mb-4">
                <div className="row">
                  <span className="k">Route to</span>
                  <span className="v">
                    {revisitRoute === "csa"
                      ? "CSA (intake)"
                      : "CIG (verification)"}
                  </span>
                </div>
                <div className="row">
                  <span className="k">Remarks</span>
                  <span className="v">{revisitComment}</span>
                </div>
              </div>
            </ConfirmDialog>
          </Card>
      ) : canVote ? (
        <Card className="mb-6">
          <h2 className="mb-2 font-display text-lg font-semibold text-navy-900">
            Final action
          </h2>
          <p className="text-sm text-ink-500">
            Waiting for votes ({votesCast}/{data.application.committeeSize} cast)
            {data.application.votesNeeded > 0
              ? ` — ${data.application.votesNeeded} more needed before a decision.`
              : "."}
          </p>
        </Card>
      ) : null}

      {data.latestAction ? (
        <Card>
          <h2 className="mb-2 font-display text-lg font-semibold text-navy-900">
            Latest committee action
          </h2>
          <p className="text-sm text-ink-500">
            <b className="capitalize text-ink-900">{data.latestAction.action}</b>
            {data.latestAction.actedByName ? ` by ${data.latestAction.actedByName}` : ""}{" "}
            ·{" "}
            <span className="mono">
              {new Date(data.latestAction.actedAt).toLocaleString()}
            </span>
          </p>
          {data.latestAction.comment ? (
            <p className="mt-2 text-sm text-ink-500">
              {data.latestAction.comment}
            </p>
          ) : null}
          {data.decisionEmail ? (
            <div className="mt-4 space-y-3">
              {data.decisionEmail.sent ? (
                <Alert variant="info">
                  Decision email already sent
                  {data.decisionEmail.borrowerEmail
                    ? ` to ${data.decisionEmail.borrowerEmail}`
                    : ""}
                  {data.decisionEmail.lastAttemptAt
                    ? ` (last attempt ${new Date(data.decisionEmail.lastAttemptAt).toLocaleString()})`
                    : ""}
                  .
                </Alert>
              ) : (
                <Alert variant="warning">
                  Decision email has not been sent successfully
                  {data.decisionEmail.borrowerEmail
                    ? ` to ${data.decisionEmail.borrowerEmail}`
                    : " (borrower has no email on file)"}
                  {data.decisionEmail.lastFailureReason
                    ? ` — ${data.decisionEmail.lastFailureReason}`
                    : ""}
                  .
                </Alert>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setResendOpen(true)}
                disabled={resending}
              >
                Resend email
              </Button>
              <ConfirmDialog
                open={resendOpen}
                title="Resend decision email?"
                message={`Send the decision email again to ${
                  data.decisionEmail.borrowerEmail ?? "the borrower"
                }?`}
                confirmLabel="Resend"
                loading={resending}
                onCancel={() => setResendOpen(false)}
                onConfirm={() => void handleResendDecisionEmail()}
              />
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
