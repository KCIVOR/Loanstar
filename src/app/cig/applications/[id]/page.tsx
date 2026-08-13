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
  Modal,
  PageHeader,
  Select,
  Spinner,
  Stepper,
  Textarea,
} from "@/components/ui";
import { DocumentChecklist } from "@/components/DocumentChecklist";
import { ApplicantProfileFields } from "@/components/borrowers/ApplicantProfileFields";
import {
  CiReferencesFormModal,
  ciFormCompletionBadge,
  type CiFormDraft,
} from "@/components/cig/CiReferencesFormModal";
import { FieldVisitForm } from "@/components/cig/FieldVisitForm";
import { SmeReloanVerificationForm } from "@/components/cig/SmeReloanVerificationForm";
import { usePermissions } from "@/hooks/usePermissions";
import { formatStatusLabel, statusBadgeVariant } from "@/lib/applications/status";
import type { BorrowerProfile } from "@/lib/borrowers/types";
import type {
  FieldVisit,
  SmeReloanVerification,
} from "@/lib/cig/field-visit";
import {
  assessFieldVisitRequired,
  assessSmeReloanRequired,
} from "@/lib/cig/field-visit";
import {
  buildCigWorkspaceSteps,
  cigChecksSummary,
  cigFormComplete,
  cigForwardReady,
  cigHasFinding,
  cigNextStep,
  cigSequenceLockedHint,
  cigWaitingLabel,
} from "@/lib/cig/workspace";
import type { CigSequenceState } from "@/lib/cig/sequence";
import type {
  PicDemeanorTag,
  PicPaymentPreference,
  PicVerification,
  ReferenceVerification,
  VerificationChecklist,
} from "@/lib/cig/verification";

type VerificationData = {
  fieldCompletenessOk: boolean | null;
  fieldCompletenessNotes: string | null;
  biIdentityConfirmed: boolean | null;
  biPurposeConfirmed: boolean | null;
  biDetailsConfirmed: boolean | null;
  biNotes: string | null;
  picAllotmentAwareness: string | null;
  picPaymentReliability: string | null;
  picInterviewNotes: string | null;
  cmDepartureDate: string | null;
  cmSalary: number | null;
  cmPosition: string | null;
  cmContractStatus: string | null;
  cmFitToWork: boolean | null;
  cmNotes: string | null;
  characterReferencesNotes: string | null;
  charRefOtherLenders: boolean | null;
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
  finding: "positive" | "negative" | null;
  findingNotes: string | null;
  forwardedAt: string | null;
};

type ReceiptItem = {
  label: string;
  ok: boolean;
  detail?: string;
};

type CheckItem = {
  slug: string | null;
  name: string | null;
  result: string;
};

type ActiveCallback = {
  id: string;
  scheduledAt: string;
  notes: string | null;
} | null;

const FALLBACK_SEQUENCE: CigSequenceState = {
  current: "borrower_review",
  completed: {
    borrower_review: false,
    external_checks: false,
    ci_references: false,
    crewing_manager: false,
    finding: false,
    forward: false,
  },
  unlocked: {
    borrower_review: true,
    external_checks: false,
    ci_references: false,
    crewing_manager: false,
    finding: false,
    forward: false,
  },
};

const CheckIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
const ClockIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);

const CHECK_STATE: Record<string, "ok" | "miss" | "pend"> = {
  pass: "ok",
  fail: "miss",
  pending: "pend",
};

const CHECK_ICON: Record<"ok" | "miss" | "pend", React.ReactNode> = {
  ok: CheckIcon,
  miss: "·",
  pend: ClockIcon,
};

const CHECK_SUBTITLE: Record<"ok" | "miss" | "pend", string> = {
  ok: "Passed",
  miss: "Failed",
  pend: "Not yet recorded",
};

function displayText(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

export default function CigApplicationPage() {
  const params = useParams();
  const applicationId = params.id as string;
  const { permissions } = usePermissions();
  const verifierName = permissions?.fullName ?? "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editable, setEditable] = useState(true);
  const [borrower, setBorrower] = useState<BorrowerProfile | null>(null);
  const [verification, setVerification] = useState<VerificationData | null>(null);
  const [showCiForm, setShowCiForm] = useState(false);
  const [showApplicationForm, setShowApplicationForm] = useState(false);
  const [showFieldVisitForm, setShowFieldVisitForm] = useState(false);
  const [checks, setChecks] = useState<CheckItem[]>([]);
  const [completeness, setCompleteness] = useState<{ complete: boolean; missing: string[] }>({
    complete: false,
    missing: [],
  });
  const [sequence, setSequence] = useState<CigSequenceState>(FALLBACK_SEQUENCE);
  const [applicationStatus, setApplicationStatus] = useState("");
  const [applicationNo, setApplicationNo] = useState<string | null>(null);
  const [segment, setSegment] = useState<"seafarer" | "sme">("seafarer");
  const [entityType, setEntityType] = useState<"individual" | "corporate" | null>(
    null,
  );
  const [isReloan, setIsReloan] = useState(false);
  const [endorsedAt, setEndorsedAt] = useState<string | null>(null);
  const [callbackAt, setCallbackAt] = useState("");
  const [callbackNotes, setCallbackNotes] = useState("");
  const [activeCallback, setActiveCallback] = useState<ActiveCallback>(null);
  const [receipt, setReceipt] = useState<{
    ready: boolean;
    items: ReceiptItem[];
  } | null>(null);
  const [borrowerId, setBorrowerId] = useState<string | null>(null);
  const [returnNote, setReturnNote] = useState("");
  const [returnOpen, setReturnOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const [appRes, checksRes] = await Promise.all([
        fetch(`/api/cig/applications/${applicationId}`),
        fetch(`/api/cig/applications/${applicationId}/checks`),
      ]);
      if (!appRes.ok) throw new Error("Failed to load application");
      const appData = (await appRes.json()) as {
        application: {
          editable: boolean;
          status: string;
          statusLabel: string;
          applicationNo: string | null;
          endorsedAt: string | null;
          segment?: "seafarer" | "sme";
          entityType?: "individual" | "corporate" | null;
          isReloan?: boolean;
        };
        borrower: (BorrowerProfile & { id?: string }) | null;
        verification: VerificationData;
        completeness: { complete: boolean; missing: string[] };
        sequence?: CigSequenceState;
        activeCallback: ActiveCallback;
        receipt: { ready: boolean; items: ReceiptItem[] } | null;
      };
      setEditable(appData.application.editable);
      setApplicationStatus(appData.application.status);
      setApplicationNo(appData.application.applicationNo);
      setSegment(
        appData.application.segment === "sme" ? "sme" : "seafarer",
      );
      setEntityType(appData.application.entityType ?? null);
      setIsReloan(Boolean(appData.application.isReloan));
      setEndorsedAt(appData.application.endorsedAt);
      setBorrower(appData.borrower);
      setBorrowerId(appData.borrower?.id ?? null);
      setVerification(appData.verification);
      setCompleteness(appData.completeness);
      setSequence(appData.sequence ?? FALLBACK_SEQUENCE);
      setActiveCallback(appData.activeCallback);
      setReceipt(appData.receipt ?? null);

      if (checksRes.ok) {
        const checksData = (await checksRes.json()) as { checks: CheckItem[] };
        setChecks(checksData.checks);
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

  async function handleRevisionComplete() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(
        `/api/cig/applications/${applicationId}/revision-complete`,
        { method: "POST" },
      );
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed");
      setMessage("Revision complete — returned to Committee.");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveVerification(patch: Record<string, unknown>) {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/cig/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verification: patch }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setMessage("Verification saved.");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveSequenceStage(
    stage: "borrower_review" | "crewing_manager" | "finding",
  ) {
    if (!verification) return;

    const patch: Record<string, unknown> = {};

    if (stage === "borrower_review") {
      if (verification.fieldCompletenessOk !== null) {
        patch.fieldCompletenessOk = verification.fieldCompletenessOk;
      }
      if (verification.fieldCompletenessNotes != null) {
        patch.fieldCompletenessNotes = verification.fieldCompletenessNotes;
      }
      if (verification.biIdentityConfirmed !== null) {
        patch.biIdentityConfirmed = verification.biIdentityConfirmed;
      }
      if (verification.biPurposeConfirmed !== null) {
        patch.biPurposeConfirmed = verification.biPurposeConfirmed;
      }
      if (verification.biDetailsConfirmed !== null) {
        patch.biDetailsConfirmed = verification.biDetailsConfirmed;
      }
      if (verification.biNotes != null) {
        patch.biNotes = verification.biNotes;
      }
    }

    if (stage === "crewing_manager") {
      if (!sequence.unlocked.crewing_manager) {
        setError(cigSequenceLockedHint("crewing_manager"));
        return;
      }
      if (verification.cmDepartureDate) {
        patch.cmDepartureDate = verification.cmDepartureDate;
      }
      if (verification.cmSalary != null) {
        patch.cmSalary = verification.cmSalary;
      }
      if (verification.cmPosition) {
        patch.cmPosition = verification.cmPosition;
      }
      if (verification.cmContractStatus) {
        patch.cmContractStatus = verification.cmContractStatus;
      }
      if (verification.cmFitToWork !== null) {
        patch.cmFitToWork = verification.cmFitToWork;
      }
      if (verification.cmNotes != null) {
        patch.cmNotes = verification.cmNotes;
      }
    }

    if (stage === "finding") {
      if (!sequence.unlocked.finding) {
        setError(cigSequenceLockedHint("finding"));
        return;
      }
      if (verification.finding) {
        patch.finding = verification.finding;
      }
      if (verification.findingNotes != null) {
        patch.findingNotes = verification.findingNotes;
      }
    }

    if (Object.keys(patch).length === 0) {
      setError("Fill in this section before saving.");
      return;
    }

    await saveVerification(patch);
  }

  async function saveCiForm(draft: CiFormDraft) {
    if (!sequence.unlocked.ci_references) {
      setError(cigSequenceLockedHint("ci_references"));
      return;
    }
    await saveVerification({
      picVerification: draft.pic,
      referenceVerifications: draft.references,
      verificationChecklist: draft.checklist,
      picPaymentPreference: draft.paymentPreference,
      picDemeanor: draft.demeanor,
      picRating: draft.rating,
      picRatingReason: draft.ratingReason,
      cifVerifiedBy: draft.verifiedBy,
      cifVerifiedDate: draft.verifiedDate,
    });
  }

  async function handleSaveBorrower(e: FormEvent) {
    e.preventDefault();
    if (!borrower) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/cig/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          borrower: { firstName: borrower.firstName, lastName: borrower.lastName },
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setMessage("Borrower name updated.");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function recordCheck(slug: string, result: "pass" | "fail") {
    if (!sequence.unlocked.external_checks) {
      setError(cigSequenceLockedHint("external_checks"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/cig/applications/${applicationId}/checks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkTypeSlug: slug, result }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Check failed");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check failed");
    } finally {
      setSaving(false);
    }
  }

  async function scheduleCallback(e: FormEvent) {
    e.preventDefault();
    if (!callbackAt) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/cig/applications/${applicationId}/callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledAt: new Date(callbackAt).toISOString(),
          notes: callbackNotes || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Callback failed");
      setMessage("Callback scheduled — file removed from active queue until due.");
      setCallbackAt("");
      setCallbackNotes("");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Callback failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitReport() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/cig/applications/${applicationId}/forward`, {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string; missing?: string[] };
      if (!res.ok) {
        throw new Error(
          data.missing?.length
            ? `${data.error ?? "Not ready"}: ${data.missing[0]}`
            : (data.error ?? "Submit failed"),
        );
      }
      setSubmitOpen(false);
      setMessage("CI report submitted — file is with Committee.");
      setEditable(false);
      await load({ silent: true });
    } catch (err) {
      setSubmitOpen(false);
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleReturnToCsa() {
    if (!returnNote.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/cig/applications/${applicationId}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: returnNote.trim() }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Return failed");
      setReturnOpen(false);
      setReturnNote("");
      setMessage("File returned to CSA with your note.");
      await load({ silent: true });
    } catch (err) {
      setReturnOpen(false);
      setError(err instanceof Error ? err.message : "Return failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;
  if (!verification) return <Alert>Application not found.</Alert>;

  const title = borrower
    ? `${borrower.firstName} ${borrower.lastName}`.trim()
    : "Verification";

  const formMissing = completeness.missing.filter(
    (item) => !item.endsWith(" check not recorded"),
  );
  const checksSummary = cigChecksSummary(checks);
  const progressComplete =
    formMissing.length === 0 && checksSummary.complete;
  const profileColumnClass = progressComplete
    ? "flex h-full flex-col"
    : "flex h-full flex-col lg:min-h-[32rem] lg:max-h-[32rem]";
  const formComplete = cigFormComplete(completeness.missing);
  const hasFinding = cigHasFinding(verification.finding);
  const forwarded = Boolean(verification.forwardedAt);
  const forwardReady = cigForwardReady({
    checksComplete: checksSummary.complete,
    formComplete,
    hasFinding,
    forwarded,
  });
  const callbackOverdue = Boolean(
    activeCallback &&
      new Date(activeCallback.scheduledAt).getTime() <= Date.now(),
  );
  const guidance = cigNextStep({
    status: applicationStatus,
    missing: completeness.missing,
    sequence,
    forwarded,
    activeCallbackAt: activeCallback?.scheduledAt ?? null,
    callbackOverdue,
  });
  const workspaceSteps = buildCigWorkspaceSteps({
    status: applicationStatus || "for_verification",
    sequenceCurrent: sequence.current,
    forwarded,
  });
  const waiting = cigWaitingLabel(endorsedAt);
  const checksUnlocked = !editable || sequence.unlocked.external_checks;
  const ciUnlocked = !editable || sequence.unlocked.ci_references;
  const crewingUnlocked = !editable || sequence.unlocked.crewing_manager;
  const findingUnlocked = !editable || sequence.unlocked.finding;

  return (
    <div>
      <Breadcrumbs
        className="mb-3"
        items={[
          { label: "CIG queue", href: "/cig" },
          { label: title },
        ]}
      />
      <PageHeader
        title={title}
        description={
          applicationNo
            ? `${applicationNo} · verification workspace`
            : `${borrower?.borrowerNo ?? "Application"} · verification workspace`
        }
        actions={
          applicationStatus ? (
            <Badge variant={statusBadgeVariant(applicationStatus)} dot>
              {formatStatusLabel(applicationStatus)}
            </Badge>
          ) : undefined
        }
      />

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
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
        <span>
          <b>{guidance.title}</b>
          {" — "}
          {guidance.body}
        </span>
      </div>

      {/* Meridian verification strip */}
      <section className="mb-6 overflow-hidden rounded-[var(--r-lg)] border border-navy-800 bg-navy-950 text-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-800 px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {applicationStatus ? (
              <Badge variant={statusBadgeVariant(applicationStatus)} dot>
                {formatStatusLabel(applicationStatus)}
              </Badge>
            ) : null}
            {applicationStatus === "for_revision" ? (
              <Badge variant="danger" dot>
                Committee revisit
              </Badge>
            ) : null}
            {activeCallback ? (
              <Badge variant={callbackOverdue ? "warning" : "neutral"} dot>
                {callbackOverdue ? "Callback overdue" : "Callback held"}
              </Badge>
            ) : null}
            <Badge variant={forwardReady ? "success" : "warning"}>
              {forwarded
                ? "Forwarded"
                : forwardReady
                  ? "Forward ready"
                  : "Forward blocked"}
            </Badge>
          </div>
          <p className="text-xs text-navy-200">
            Waiting {waiting}
            {endorsedAt
              ? ` · Endorsed ${new Date(endorsedAt).toLocaleDateString("en-PH", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}`
              : ""}
          </p>
        </div>

        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-navy-200 opacity-80">
              Application no.
            </div>
            <div className="mono mt-1 text-lg font-semibold text-teal-300">
              {applicationNo ?? "Pending"}
            </div>
          </div>
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-navy-200 opacity-80">
              External checks
            </div>
            <div className="mono mt-1 text-lg font-semibold text-teal-300">
              {checksSummary.total > 0
                ? `${checksSummary.recorded}/${checksSummary.total}`
                : "—"}
            </div>
            {checksSummary.total > 0 ? (
              <div
                className="mt-2 h-1.5 overflow-hidden rounded-full"
                style={{ background: "rgba(255,255,255,0.15)" }}
              >
                <div
                  className="h-full rounded-full bg-teal-400"
                  style={{ width: `${checksSummary.percent}%` }}
                />
              </div>
            ) : null}
          </div>
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-navy-200 opacity-80">
              Finding
            </div>
            <div className="mt-1">
              {verification.finding ? (
                <Badge
                  variant={
                    verification.finding === "positive" ? "success" : "danger"
                  }
                >
                  {verification.finding === "positive"
                    ? "Positive"
                    : "Negative"}
                </Badge>
              ) : (
                <span className="text-sm text-navy-100">Not set</span>
              )}
            </div>
          </div>
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-navy-200 opacity-80">
              Verification form
            </div>
            <div className="mono mt-1 text-lg font-semibold text-teal-300">
              {formComplete ? "Complete" : "In progress"}
            </div>
          </div>
        </div>
      </section>

      <Card className="mb-6 overflow-x-auto !bg-surface-2/40">
        <h2 className="mb-3 font-display text-lg font-semibold text-navy-900">
          CIG verification progress
        </h2>
        <Stepper steps={workspaceSteps} className="w-full max-w-none" />
      </Card>

      {editable && receipt ? (
        <Card className="mb-6">
          <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
            Receipt check
          </h2>
          <p className="mb-4 text-sm text-ink-500">
            Confirm the endorsed file is complete before starting verification.
            If anything is missing, return it to CSA with a note.
          </p>
          <div className="chk-list chk-list--page !max-w-none">
            {receipt.items.map((item) => (
              <div key={item.label} className={`ci ${item.ok ? "ok" : "miss"}`}>
                <span className="st">{item.ok ? CheckIcon : "·"}</span>
                <div className="min-w-0 leading-snug">
                  <b>{item.label}</b>
                  <span>{item.detail ?? (item.ok ? "Complete" : "Missing")}</span>
                </div>
              </div>
            ))}
          </div>
          {!receipt.ready ? (
            <div className="mt-4 grid gap-3">
              <div>
                <Label htmlFor="returnNote" required>
                  Note for CSA
                </Label>
                <Textarea
                  id="returnNote"
                  placeholder="What needs to be fixed before CIG can start?"
                  value={returnNote}
                  onChange={(e) => setReturnNote(e.target.value)}
                />
              </div>
              <div>
                <Button
                  variant="danger-soft"
                  loading={saving}
                  disabled={!returnNote.trim()}
                  onClick={() => setReturnOpen(true)}
                >
                  Return to CSA
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      <DocumentChecklist
        applicationId={applicationId}
        borrowerId={borrowerId ?? ""}
        stage="intake"
        readOnly
        checklistApiPath={`/api/cig/applications/${applicationId}/checklist`}
        viewApiPath={(documentId) => `/api/documents/${documentId}/download`}
        title="Borrower attachments"
        description="Read-only — passport, seaman's book, contract, and other intake files. Computation details are not shown to CIG."
      />

      {borrower ? (
        <>
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
              Open application form
            </Button>
          </Card>
          <Modal
            open={showApplicationForm}
            title="Application Form"
            onClose={() => setShowApplicationForm(false)}
            className="!max-w-4xl"
          >
            <div className="max-h-[65vh] overflow-y-auto pr-1">
              <ApplicantProfileFields
                profile={borrower}
                segment={segment}
                entityType={entityType}
                readOnly
              />
            </div>
          </Modal>
        </>
      ) : null}

      {applicationStatus === "for_revision" ? (
        <Card className="mb-6 !bg-surface-2/40">
          <h2 className="mb-2 font-display text-lg font-semibold text-navy-900">
            Committee revisit
          </h2>
          <p className="mb-3 text-sm text-ink-500">
            Committee requested verification revisions. Complete updates and
            return the file to Committee.
          </p>
          <Button loading={saving} onClick={() => void handleRevisionComplete()}>
            Revision complete
          </Button>
        </Card>
      ) : null}

      {verification.forwardedAt ? (
        <div className="mb-6">
          <Alert variant="success">
            Forwarded to Committee on{" "}
            <span className="mono">
              {new Date(verification.forwardedAt).toLocaleString()}
            </span>
          </Alert>
        </div>
      ) : null}

      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-stretch">
          <div className="min-h-0 min-w-0">
            {borrower ? (
              <div
                className={`card profile-card !max-w-none ${
                  progressComplete
                    ? "flex h-full flex-col"
                    : "flex h-full flex-col lg:min-h-[32rem] lg:max-h-[32rem]"
                }`}
              >
                <div className="cover shrink-0" />
                <div className="pbody flex min-h-0 flex-1 flex-col !pb-6">
                  <Avatar
                    initials={`${borrower.firstName.charAt(0)}${borrower.lastName.charAt(0)}`}
                    size="lg"
                  />
                  <div className="nm">
                    {borrower.firstName} {borrower.lastName}
                  </div>
                  <div className="rl">
                    {[
                      borrower.picWork?.rank,
                      borrower.picWork?.vessel,
                      borrower.borrowerNo,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>

                  <div className="mt-auto border-t border-line-soft pt-4">
                    {editable ? (
                      <form
                        onSubmit={(e) => void handleSaveBorrower(e)}
                        className="grid gap-3"
                      >
                        <div>
                          <Label htmlFor="firstName">First name</Label>
                          <Input
                            id="firstName"
                            value={borrower.firstName}
                            onChange={(e) =>
                              setBorrower({
                                ...borrower,
                                firstName: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div>
                          <Label htmlFor="lastName">Last name</Label>
                          <Input
                            id="lastName"
                            value={borrower.lastName}
                            onChange={(e) =>
                              setBorrower({
                                ...borrower,
                                lastName: e.target.value,
                              })
                            }
                          />
                        </div>
                        <Button type="submit" loading={saving} size="sm">
                          Save name
                        </Button>
                      </form>
                    ) : (
                      <div className="kv contact-kv">
                        <div className="row">
                          <span className="k">First name</span>
                          <span className="v">
                            {displayText(borrower.firstName)}
                          </span>
                        </div>
                        <div className="row">
                          <span className="k">Last name</span>
                          <span className="v">
                            {displayText(borrower.lastName)}
                          </span>
                        </div>
                        <div className="row">
                          <span className="k">Email</span>
                          <span className="v">
                            {displayText(borrower.email)}
                          </span>
                        </div>
                        <div className="row">
                          <span className="k">Mobile</span>
                          <span className="v mono">
                            {borrower.mobilePhone?.trim()
                              ? borrower.mobilePhone
                              : "—"}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <Card className={profileColumnClass}>
                <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
                  Profile
                </h2>
                <p className="text-sm text-ink-500">
                  No borrower profile on file.
                </p>
              </Card>
            )}
          </div>

          <div className="min-h-0 min-w-0">
            <Card
              className={
                progressComplete
                  ? "flex h-full flex-col"
                  : "flex h-full flex-col lg:min-h-[32rem] lg:max-h-[32rem]"
              }
            >
              <h2 className="mb-1 shrink-0 font-display text-lg font-semibold text-navy-900">
                Verification progress
              </h2>
              <p className="mb-4 shrink-0 text-sm text-ink-500">
                {editable
                  ? segment === "sme"
                    ? "Complete sections in order: borrower review → checks → Field Visit → finding."
                    : "Complete sections in order: borrower review → checks → CI & Refs → crewing → finding."
                  : "Submitted to Committee — view only."}
              </p>
              <div
                className={`chk-list !max-w-none pr-1 ${
                  progressComplete ? "" : "min-h-0 flex-1 overflow-y-auto"
                }`}
              >
                {progressComplete ? (
                  <div className="ci ok">
                    <span className="st">{CheckIcon}</span>
                    <div>
                      <b>All verification requirements met</b>
                      <span>
                        {forwarded
                          ? "CI report submitted"
                          : "Ready to submit when finding is set"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    {formMissing.map((item) => (
                      <div key={item} className="ci miss">
                        <span className="st">·</span>
                        <div>
                          <b>{item}</b>
                          <span>Not yet complete</span>
                        </div>
                      </div>
                    ))}
                    {completeness.missing
                      .filter((item) => item.endsWith(" check not recorded"))
                      .map((item) => (
                        <div key={item} className="ci miss">
                          <span className="st">·</span>
                          <div>
                            <b>{item}</b>
                            <span>Not yet complete</span>
                          </div>
                        </div>
                      ))}
                  </>
                )}
              </div>
            </Card>
          </div>
        </div>

        <div className="space-y-6">
            {!editable ? (
              <Alert variant="info">
                Submitted to Committee — view only. Edits are locked.
              </Alert>
            ) : null}
            <Card>
              <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
                Field completeness
              </h2>
              <p className="mb-3 text-sm text-ink-500">
                Confirm the application&apos;s submitted fields are complete and consistent.
              </p>
              <div>
                <Label htmlFor="fieldOk">Field completeness OK?</Label>
                <Select
                  id="fieldOk"
                  disabled={!editable}
                  value={
                    verification.fieldCompletenessOk === null
                      ? ""
                      : verification.fieldCompletenessOk
                        ? "yes"
                        : "no"
                  }
                  onChange={(e) =>
                    setVerification({
                      ...verification,
                      fieldCompletenessOk:
                        e.target.value === "" ? null : e.target.value === "yes",
                    })
                  }
                >
                  <option value="">Select</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </Select>
              </div>
            </Card>

            <Card>
              <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
                Borrower interview
              </h2>
              <p className="mb-3 text-sm text-ink-500">
                Direct call to the borrower — confirm identity, loan purpose,
                and the details on the application.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    {
                      key: "biIdentityConfirmed",
                      label: "Identity confirmed?",
                    },
                    {
                      key: "biPurposeConfirmed",
                      label: "Loan purpose confirmed?",
                    },
                    {
                      key: "biDetailsConfirmed",
                      label: "Application details true?",
                    },
                  ] as const
                ).map(({ key, label }) => (
                  <div key={key}>
                    <Label htmlFor={key}>{label}</Label>
                    <Select
                      id={key}
                      disabled={!editable}
                      value={
                        verification[key] === null
                          ? ""
                          : verification[key]
                            ? "yes"
                            : "no"
                      }
                      onChange={(e) =>
                        setVerification({
                          ...verification,
                          [key]:
                            e.target.value === ""
                              ? null
                              : e.target.value === "yes",
                        })
                      }
                    >
                      <option value="">Select</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </Select>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <Label htmlFor="biNotes">Interview notes</Label>
                <Textarea
                  id="biNotes"
                  disabled={!editable}
                  value={verification.biNotes ?? ""}
                  onChange={(e) =>
                    setVerification({
                      ...verification,
                      biNotes: e.target.value,
                    })
                  }
                />
              </div>
              {editable ? (
                <div className="mt-4">
                  <Button
                    type="button"
                    loading={saving}
                    onClick={() => void saveSequenceStage("borrower_review")}
                  >
                    Save borrower review
                  </Button>
                </div>
              ) : null}
            </Card>

            {editable && !checksUnlocked ? (
              <Card className="!bg-surface-2/40">
                <p className="text-sm text-ink-500">
                  <b>Next:</b> External checks unlock after you save borrower
                  review.
                </p>
              </Card>
            ) : checksUnlocked ? (
              <Card>
                <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
                  External checks
                </h2>
                <p className="mb-4 text-sm text-ink-500">
                  {editable
                    ? "Third-party checks recorded after borrower review is complete."
                    : "Submitted to Committee — view only."}
                </p>
                <div className="chk-list chk-list--page !max-w-none">
                  {checks.map((check) => {
                    const state = CHECK_STATE[check.result] ?? "pend";
                    return (
                      <div
                        key={check.slug ?? check.name}
                        className={`ci ${state}`}
                      >
                        <span className="st">{CHECK_ICON[state]}</span>
                        <div className="min-w-0 flex-1">
                          <b>{check.name}</b>
                          <span>{CHECK_SUBTITLE[state]}</span>
                        </div>
                        {editable && check.slug ? (
                          <span className="act flex shrink-0 items-center gap-2">
                            <Button
                              type="button"
                              variant="accent"
                              size="sm"
                              loading={saving}
                              onClick={() =>
                                void recordCheck(check.slug!, "pass")
                              }
                            >
                              Pass
                            </Button>
                            <Button
                              type="button"
                              variant="danger-soft"
                              size="sm"
                              loading={saving}
                              onClick={() =>
                                void recordCheck(check.slug!, "fail")
                              }
                            >
                              Fail
                            </Button>
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </Card>
            ) : null}

            {segment === "sme" ? (
              <>
                {editable && checksUnlocked && !ciUnlocked ? (
                  <Card className="!bg-surface-2/40">
                    <p className="text-sm text-ink-500">
                      <b>Next:</b> Field Visit unlocks when all external checks
                      are recorded.
                    </p>
                  </Card>
                ) : null}

                {ciUnlocked ? (
                  <Card>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
                          {isReloan
                            ? "SME re-loan verification"
                            : "SME Field Visit"}
                        </h2>
                        <p className="mb-3 text-sm text-ink-500">
                          {editable
                            ? isReloan
                              ? "Re-verification of field investigation for repeat borrowers."
                              : "Site visit form — replaces PIC/CM phone verification for SME."
                            : "Submitted to Committee — view only."}
                        </p>
                      </div>
                      <Badge
                        variant={
                          (isReloan
                            ? assessSmeReloanRequired(
                                verification.smeReloanVerification,
                              )
                            : assessFieldVisitRequired(
                                verification.fieldVisit,
                              )
                          ).complete
                            ? "success"
                            : "warning"
                        }
                      >
                        {(isReloan
                          ? assessSmeReloanRequired(
                              verification.smeReloanVerification,
                            )
                          : assessFieldVisitRequired(verification.fieldVisit)
                        ).complete
                          ? "Complete"
                          : "In progress"}
                      </Badge>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setShowFieldVisitForm(true)}
                    >
                      {editable
                        ? isReloan
                          ? "Open SME re-loan verification"
                          : "Open SME Field Visit"
                        : isReloan
                          ? "View SME re-loan verification"
                          : "View SME Field Visit"}
                    </Button>
                  </Card>
                ) : null}

                {editable && crewingUnlocked && !findingUnlocked ? (
                  <Card className="!bg-surface-2/40">
                    <p className="text-sm text-ink-500">
                      <b>Next:</b> Finding unlocks after Field Visit is
                      complete.
                    </p>
                  </Card>
                ) : null}
              </>
            ) : (
              <>
                {editable && checksUnlocked && !ciUnlocked ? (
                  <Card className="!bg-surface-2/40">
                    <p className="text-sm text-ink-500">
                      <b>Next:</b> CI &amp; References Form unlocks when all
                      external checks are recorded.
                    </p>
                  </Card>
                ) : null}

                {ciUnlocked ? (
                  <Card>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
                          CI &amp; References Form
                        </h2>
                        <p className="mb-3 text-sm text-ink-500">
                          {editable
                            ? "PIC (person-in-charge) and character reference phone verification — recreates CI AND REFERENCES FORM 1.xlsx."
                            : "Submitted to Committee — view only."}
                        </p>
                      </div>
                      <Badge
                        variant={ciFormCompletionBadge(verification).variant}
                      >
                        {ciFormCompletionBadge(verification).label}
                      </Badge>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setShowCiForm(true)}
                    >
                      {editable
                        ? "Open CI & References Form"
                        : "View CI & References Form"}
                    </Button>
                  </Card>
                ) : null}

                {editable && ciUnlocked && !crewingUnlocked ? (
                  <Card className="!bg-surface-2/40">
                    <p className="text-sm text-ink-500">
                      <b>Next:</b> Crewing manager unlocks when CI &amp;
                      References is complete.
                    </p>
                  </Card>
                ) : null}

                {crewingUnlocked ? (
                  <Card>
                    <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
                      Crewing manager
                    </h2>
                    <p className="mb-3 text-sm text-ink-500">
                      Details confirmed directly with the manning agency&apos;s
                      crewing manager.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="cmDeparture">Departure date</Label>
                        <Input
                          id="cmDeparture"
                          type="date"
                          disabled={!editable}
                          value={verification.cmDepartureDate ?? ""}
                          onChange={(e) =>
                            setVerification({
                              ...verification,
                              cmDepartureDate: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="cmSalary">Salary</Label>
                        <div className="affix">
                          <span className="add">₱</span>
                          <Input
                            id="cmSalary"
                            type="number"
                            step="0.01"
                            disabled={!editable}
                            value={verification.cmSalary ?? ""}
                            onChange={(e) =>
                              setVerification({
                                ...verification,
                                cmSalary: e.target.value
                                  ? Number(e.target.value)
                                  : null,
                              })
                            }
                            mono
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="cmPosition">Position</Label>
                        <Input
                          id="cmPosition"
                          disabled={!editable}
                          value={verification.cmPosition ?? ""}
                          onChange={(e) =>
                            setVerification({
                              ...verification,
                              cmPosition: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="cmContract">Contract status</Label>
                        <Input
                          id="cmContract"
                          disabled={!editable}
                          value={verification.cmContractStatus ?? ""}
                          onChange={(e) =>
                            setVerification({
                              ...verification,
                              cmContractStatus: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="cmFitToWork">Fit to work?</Label>
                        <Select
                          id="cmFitToWork"
                          disabled={!editable}
                          value={
                            verification.cmFitToWork === null
                              ? ""
                              : verification.cmFitToWork
                                ? "yes"
                                : "no"
                          }
                          onChange={(e) =>
                            setVerification({
                              ...verification,
                              cmFitToWork:
                                e.target.value === ""
                                  ? null
                                  : e.target.value === "yes",
                            })
                          }
                        >
                          <option value="">Select</option>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </Select>
                      </div>
                    </div>
                    {editable ? (
                      <div className="mt-4">
                        <Button
                          type="button"
                          loading={saving}
                          onClick={() =>
                            void saveSequenceStage("crewing_manager")
                          }
                        >
                          Save crewing manager
                        </Button>
                      </div>
                    ) : null}
                  </Card>
                ) : null}

                {editable && crewingUnlocked && !findingUnlocked ? (
                  <Card className="!bg-surface-2/40">
                    <p className="text-sm text-ink-500">
                      <b>Next:</b> Finding unlocks after crewing manager is
                      saved complete.
                    </p>
                  </Card>
                ) : null}
              </>
            )}

            {findingUnlocked ? (
              <Card>
                <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
                  Finding
                </h2>
                <p className="mb-3 text-sm text-ink-500">
                  Overall verification outcome — determines what Committee sees.
                </p>
                {verification.finding ? (
                  <div className="mb-3">
                    <Badge
                      variant={
                        verification.finding === "positive"
                          ? "success"
                          : "danger"
                      }
                    >
                      {verification.finding === "positive"
                        ? "Positive finding"
                        : "Negative finding"}
                    </Badge>
                  </div>
                ) : null}
                <div className="mb-4">
                  <Label htmlFor="finding">Finding</Label>
                  <Select
                    id="finding"
                    disabled={!editable}
                    value={verification.finding ?? ""}
                    onChange={(e) =>
                      setVerification({
                        ...verification,
                        finding: (e.target.value || null) as
                          | "positive"
                          | "negative"
                          | null,
                      })
                    }
                  >
                    <option value="">Select</option>
                    <option value="positive">Positive</option>
                    <option value="negative">Negative</option>
                  </Select>
                </div>
                {editable ? (
                  <Button
                    type="button"
                    loading={saving}
                    onClick={() => void saveSequenceStage("finding")}
                  >
                    Save finding
                  </Button>
                ) : null}
              </Card>
            ) : null}
          </div>
          {showCiForm && segment !== "sme" ? (
            <CiReferencesFormModal
              open={showCiForm}
              onClose={() => setShowCiForm(false)}
              borrower={borrower}
              saved={verification}
              onSave={saveCiForm}
              saving={saving}
              readOnly={!editable}
              verifierName={verifierName}
            />
          ) : null}

          {showFieldVisitForm && segment === "sme" ? (
            <Modal
              open={showFieldVisitForm}
              onClose={() => setShowFieldVisitForm(false)}
              title={
                isReloan ? "SME re-loan verification" : "SME Field Visit"
              }
              className="!max-w-4xl"
            >
              <div className="max-h-[65vh] overflow-y-auto pr-1">
                {isReloan ? (
                  <SmeReloanVerificationForm
                    value={verification.smeReloanVerification}
                    onChange={(next) =>
                      setVerification({
                        ...verification,
                        smeReloanVerification: next,
                      })
                    }
                    onSave={(next) => {
                      if (!sequence.unlocked.ci_references) {
                        setError(cigSequenceLockedHint("ci_references"));
                        return;
                      }
                      setVerification({
                        ...verification,
                        smeReloanVerification: next,
                      });
                      void saveVerification({
                        smeReloanVerification: next,
                      });
                    }}
                    saving={saving}
                    readOnly={!editable}
                    verifierName={verifierName}
                  />
                ) : (
                  <FieldVisitForm
                    value={verification.fieldVisit}
                    onChange={(next) =>
                      setVerification({
                        ...verification,
                        fieldVisit: next,
                      })
                    }
                    onSave={(next) => {
                      if (!sequence.unlocked.ci_references) {
                        setError(cigSequenceLockedHint("ci_references"));
                        return;
                      }
                      setVerification({
                        ...verification,
                        fieldVisit: next,
                      });
                      void saveVerification({ fieldVisit: next });
                    }}
                    saving={saving}
                    readOnly={!editable}
                    verifierName={verifierName}
                  />
                )}
              </div>
            </Modal>
          ) : null}

        {editable && !forwarded ? (
          <Card>
            <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
              CI report
            </h2>
            <p className="mb-4 text-sm text-ink-500">
              Submitting sends the consolidated findings and the full file to
              the Approving Committee. Save the form first — unsaved changes
              are not included.
            </p>
            {!forwardReady ? (
              <div className="banner warn mb-4">
                <b>Not ready yet — the following must be completed first:</b>
                {completeness.missing.length > 0 ? (
                  <ul className="mt-1 list-disc pl-5">
                    {completeness.missing.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="mt-1 block">
                    Complete the form and checks.
                  </span>
                )}
              </div>
            ) : null}
            <Button
              loading={saving}
              disabled={!forwardReady}
              onClick={() => setSubmitOpen(true)}
            >
              Submit CI report to Committee
            </Button>
          </Card>
        ) : null}

          <Card>
            <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
              Callback
            </h2>
            <p className="mb-4 text-sm text-ink-500">
              Hold the file until a follow-up is due instead of leaving it in the
              active queue.
            </p>

            {activeCallback ? (
              <div className="banner warn mb-4">
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
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 3" />
                </svg>
                <span>
                  Callback scheduled for{" "}
                  <span className="mono">
                    {new Date(activeCallback.scheduledAt).toLocaleString()}
                  </span>
                  {activeCallback.notes ? ` — ${activeCallback.notes}` : ""}
                </span>
              </div>
            ) : null}

            {editable ? (
              <form onSubmit={(e) => void scheduleCallback(e)} className="grid gap-3">
                <div>
                  <Label htmlFor="callbackAt" required>
                    Callback datetime
                  </Label>
                  <Input
                    id="callbackAt"
                    type="datetime-local"
                    required
                    value={callbackAt}
                    onChange={(e) => setCallbackAt(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="callbackNotes">Notes</Label>
                  <Input
                    id="callbackNotes"
                    value={callbackNotes}
                    onChange={(e) => setCallbackNotes(e.target.value)}
                  />
                </div>
                <Button type="submit" variant="secondary" loading={saving}>
                  {activeCallback ? "Reschedule callback" : "Schedule callback"}
                </Button>
              </form>
            ) : (
              <p className="text-sm text-ink-500">No callback actions available.</p>
            )}
          </Card>
      </div>

      <ConfirmDialog
        open={submitOpen}
        title="Submit CI report"
        message="Submit the CI report and forward this file to the Approving Committee? Verification is locked after submission."
        confirmLabel="Yes, submit"
        cancelLabel="Cancel"
        loading={saving}
        onConfirm={() => void handleSubmitReport()}
        onCancel={() => setSubmitOpen(false)}
      />

      <ConfirmDialog
        open={returnOpen}
        title="Return file to CSA"
        message={
          <>
            Send this file back to CSA with the note{" "}
            <span className="font-medium text-ink-900">
              &ldquo;{returnNote.trim()}&rdquo;
            </span>
            ? It will leave the CIG queue until CSA re-endorses it.
          </>
        }
        confirmLabel="Yes, return"
        cancelLabel="Cancel"
        loading={saving}
        onConfirm={() => void handleReturnToCsa()}
        onCancel={() => setReturnOpen(false)}
      />
    </div>
  );
}
