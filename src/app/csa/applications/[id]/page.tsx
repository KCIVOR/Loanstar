"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
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
  Spinner,
  Stepper,
  Textarea,
} from "@/components/ui";
import { ComputationPanel } from "@/components/csa/ComputationPanel";
import { NegotiationPanel } from "@/components/csa/NegotiationPanel";
import { ApplicantProfileFields } from "@/components/borrowers/ApplicantProfileFields";
import { DocumentChecklist } from "@/components/DocumentChecklist";
import {
  formatStatusLabel,
  statusBadgeVariant,
} from "@/lib/applications/status";
import type { ChecklistItem } from "@/lib/documents/checklist";
import { isCsaEditableStatus } from "@/lib/csa/status";
import { assessApplicationFormCompleteness } from "@/lib/csa/application-form-completeness";
import {
  INITIAL_INTERVIEW_COMPUTATION_ERROR,
  listInterviewRecordPrerequisites,
} from "@/lib/csa/initial-interview";
import { daysInQueue, formatBlockerLabel } from "@/lib/csa/queue";
import {
  buildCsaWorkspaceSteps,
  csaDocsSummary,
  csaNextStep,
} from "@/lib/csa/workspace";
import type { BorrowerProfile } from "@/lib/borrowers/types";

type EndorseReadiness = {
  ready: boolean;
  coverageOk: boolean;
  coverageThreshold: number;
  missing: string[];
  warnings: string[];
};

type ApplicationWorkspace = {
  application: {
    id: string;
    applicationNo: string | null;
    status: string;
    statusLabel: string;
    blocker: string | null;
    isReloan: boolean;
    createdAt: string;
    updatedAt: string;
    privacyOrientationAt: string | null;
    privacyOrientationBy: string | null;
    privacyOrientationByName: string | null;
    initialInterviewAt: string | null;
    initialInterviewBy: string | null;
    initialInterviewNotes: string | null;
    initialInterviewByName: string | null;
  };
  borrower: BorrowerProfile | null;
  details: { loanTypeId: string | null } | null;
  checklist: ChecklistItem[];
  computation: {
    id: string;
    inputMode: string;
    inputAmount: number;
    terms: number;
    addonMonths: number;
    pfRate: number;
    interestRate: number;
    securityFeeRate: number;
    principal: number;
    processingFee: number;
    adminCost: number;
    docStamp: number;
    notaryFee: number;
    securityFee: number;
    otherDeductionsTotal: number;
    totalDeductions: number;
    netReleased: number;
    totalInterest: number;
    totalLoan: number;
    monthlyAmortization: number;
    lineItems: Array<{ key: string; label: string; amount: number }>;
    coverageWarning: boolean;
    signedAt: string | null;
    loanTypeName: string | null;
  } | null;
  endorseReadiness: EndorseReadiness;
  negotiation: {
    status: string;
    approvedAmount: number | null;
    currentAmount: number | null;
    disclosedAt: string | null;
  } | null;
};

type NclCheck = {
  result: string;
  notes: string | null;
  checkedAt: string | null;
};

const NCL_BADGE_VARIANT: Record<string, "success" | "danger" | "neutral"> = {
  pass: "success",
  fail: "danger",
  pending: "neutral",
};

const NCL_TONE: Record<string, { background: string; color: string }> = {
  pass: { background: "var(--success-bg)", color: "var(--success)" },
  fail: { background: "var(--danger-bg)", color: "var(--danger)" },
  pending: { background: "var(--surface-2)", color: "var(--ink-400)" },
};

const NCL_COPY: Record<string, string> = {
  pass: "Cleared — no negative credit list match found.",
  fail: "Flagged — borrower matched the negative credit list.",
  pending: "Not yet checked against the negative credit list.",
};

const CheckIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={3.4}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
const XIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={3}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
const ClockIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.4}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);
const NCL_ICON: Record<string, ReactNode> = {
  pass: CheckIcon,
  fail: XIcon,
  pending: ClockIcon,
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatMoney(value: number) {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function CsaApplicationPage() {
  const params = useParams();
  const applicationId = params.id as string;

  const [data, setData] = useState<ApplicationWorkspace | null>(null);
  const [ncl, setNcl] = useState<NclCheck>({
    result: "pending",
    notes: null,
    checkedAt: null,
  });
  const [holdReason, setHoldReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showApplicationForm, setShowApplicationForm] = useState(false);
  const [confirmOrientation, setConfirmOrientation] = useState(false);
  const [confirmInterview, setConfirmInterview] = useState(false);
  const [confirmClearHold, setConfirmClearHold] = useState(false);
  const [interviewNotes, setInterviewNotes] = useState("");

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      setError(null);
      try {
        const [appRes, checksRes] = await Promise.all([
          fetch(`/api/csa/applications/${applicationId}`),
          fetch(`/api/csa/applications/${applicationId}/checks`),
        ]);
        if (!appRes.ok) throw new Error("Failed to load application");
        const appData = (await appRes.json()) as ApplicationWorkspace;
        setData(appData);
        setInterviewNotes(appData.application.initialInterviewNotes ?? "");

        if (checksRes.ok) {
          const checksData = (await checksRes.json()) as {
            checks: Array<{
              slug: string | null;
              result: string;
              notes: string | null;
              checkedAt: string | null;
            }>;
          };
          const nclCheck = checksData.checks.find((c) => c.slug === "ncl");
          if (nclCheck) {
            setNcl({
              result: nclCheck.result,
              notes: nclCheck.notes,
              checkedAt: nclCheck.checkedAt,
            });
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [applicationId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSaveProfile(e?: FormEvent) {
    e?.preventDefault();
    if (!data?.borrower) return;
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/csa/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          borrower: {
            firstName: data.borrower.firstName,
            middleName: data.borrower.middleName,
            lastName: data.borrower.lastName,
            suffix: data.borrower.suffix,
            dateOfBirth: data.borrower.dateOfBirth,
            placeOfBirth: data.borrower.placeOfBirth,
            citizenship: data.borrower.citizenship,
            civilStatus: data.borrower.civilStatus,
            gender: data.borrower.gender,
            mobilePhone: data.borrower.mobilePhone,
            landline: data.borrower.landline,
            presentAddress: data.borrower.presentAddress,
            permanentAddress: data.borrower.permanentAddress,
            manningAgency: data.borrower.manningAgency,
            financial: data.borrower.financial,
            allottee: data.borrower.allottee,
            picWork: data.borrower.picWork,
            dependents: data.borrower.dependents,
            references: data.borrower.references,
            profileData: data.borrower.profileData,
          },
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Save failed");
      }
      await load({ silent: true });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleRecordNcl(result: "pass" | "fail") {
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/csa/applications/${applicationId}/checks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result, notes: ncl.notes ?? undefined }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to record NCL");
      }
      await load({ silent: true });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to record NCL",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleEndorse() {
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/csa/applications/${applicationId}/endorse`, {
        method: "POST",
      });
      const body = (await res.json()) as { error?: string; missing?: string[] };
      if (!res.ok) {
        throw new Error(
          body.missing?.length
            ? `${body.error}: ${body.missing.join(", ")}`
            : (body.error ?? "Endorse failed"),
        );
      }
      await load({ silent: true });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Endorse failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmOrientation() {
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/csa/applications/${applicationId}/privacy-orientation`,
        { method: "POST" },
      );
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to record orientation");
      }
      await load({ silent: true });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to record orientation",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmInterview() {
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/csa/applications/${applicationId}/initial-interview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: interviewNotes }),
        },
      );
      const body = (await res.json()) as {
        error?: string;
        missing?: string[];
      };
      if (!res.ok) {
        throw new Error(
          body.missing?.length
            ? `${body.error}: ${body.missing.join(", ")}`
            : (body.error ?? "Failed to record interview"),
        );
      }
      await load({ silent: true });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to record interview",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleHold(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/csa/applications/${applicationId}/hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: holdReason }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Hold failed");
      setHoldReason("");
      await load({ silent: true });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Hold failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleClearHold() {
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/csa/applications/${applicationId}/clear-hold`,
        { method: "POST" },
      );
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to clear hold");
      setConfirmClearHold(false);
      await load({ silent: true });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to clear hold",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;
  if (!data) {
    return <Alert>{error ?? "Application not found."}</Alert>;
  }

  const editable = isCsaEditableStatus(data.application.status);
  const formCompleteness = assessApplicationFormCompleteness(data.borrower);
  const nclDone = ncl.result === "pass" || ncl.result === "fail";
  const interviewPrereqs = listInterviewRecordPrerequisites({
    privacyOrientationAt: data.application.privacyOrientationAt,
    formCompleteness,
    nclRecorded: nclDone,
  });
  const borrowerTitle = data.borrower
    ? `${data.borrower.firstName} ${data.borrower.lastName}`
    : "Application";
  const docs = csaDocsSummary(data.checklist);
  const docsComplete =
    docs.required > 0 ? docs.uploaded >= docs.required : false;
  const hasComputation = Boolean(data.computation);
  const waiting = daysInQueue(
    data.application.updatedAt ?? data.application.createdAt,
  );
  const blockerLabel = formatBlockerLabel(data.application.blocker);
  const guidance = csaNextStep({
    status: data.application.status,
    blocker: data.application.blocker,
    docsRequired: docs.required,
    docsUploaded: docs.uploaded,
    nclResult: ncl.result,
    hasComputation,
    endorseReady: data.endorseReadiness.ready,
  });
  const workspaceSteps = buildCsaWorkspaceSteps({
    status: data.application.status,
    docsComplete,
    nclDone,
    hasComputation,
    endorseReady: data.endorseReadiness.ready,
  });

  return (
    <div>
      <Breadcrumbs
        className="mb-3"
        items={[
          { label: "CSA queue", href: "/csa" },
          { label: borrowerTitle },
        ]}
      />
      <PageHeader
        title={borrowerTitle}
        description={
          data.application.applicationNo
            ? `${data.application.applicationNo} · intake workspace`
            : `${data.borrower?.borrowerNo ?? "Application"} · intake workspace`
        }
        actions={
          <Badge variant={statusBadgeVariant(data.application.status)} dot>
            {data.application.statusLabel ??
              formatStatusLabel(data.application.status)}
          </Badge>
        }
      />

      {error || actionError ? (
        <div className="mb-4">
          <Alert>{error ?? actionError}</Alert>
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

      {/* Meridian intake strip — navy desk identity */}
      <section className="mb-6 overflow-hidden rounded-[var(--r-lg)] border border-navy-800 bg-navy-950 text-white">
        <div className="border-b border-navy-800 px-5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusBadgeVariant(data.application.status)} dot>
                {data.application.statusLabel ??
                  formatStatusLabel(data.application.status)}
              </Badge>
              <Badge variant="neutral">
                {data.application.isReloan ? "Reloan" : "New loan"}
              </Badge>
              <Badge variant={data.endorseReadiness.ready ? "success" : "warning"}>
                {data.endorseReadiness.ready
                  ? "Endorse ready"
                  : "Endorse blocked"}
              </Badge>
            </div>
            <p className="text-xs text-navy-200">
              Waiting {waiting === 0 ? "today" : `${waiting}d`} · Updated{" "}
              {formatDate(data.application.updatedAt)}
            </p>
          </div>
          {blockerLabel ? (
            <p className="mt-2 max-w-full break-words text-sm leading-snug text-navy-100">
              <span className="font-medium text-warning">Hold reason:</span>{" "}
              {blockerLabel}
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-navy-200 opacity-80">
              Application no.
            </div>
            <div className="mono mt-1 text-lg font-semibold text-teal-300">
              {data.application.applicationNo ?? "Pending"}
            </div>
          </div>
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-navy-200 opacity-80">
              Filed
            </div>
            <div className="mono mt-1 text-lg font-semibold">
              {formatDate(data.application.createdAt)}
            </div>
          </div>
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-navy-200 opacity-80">
              Intake docs
            </div>
            <div className="mono mt-1 text-lg font-semibold text-teal-300">
              {docs.required > 0
                ? `${docs.uploaded}/${docs.required}`
                : "—"}
            </div>
            {docs.required > 0 ? (
              <div
                className="mt-2 h-1.5 overflow-hidden rounded-full"
                style={{ background: "rgba(255,255,255,0.15)" }}
              >
                <div
                  className="h-full rounded-full bg-teal-400"
                  style={{ width: `${docs.percent}%` }}
                />
              </div>
            ) : null}
          </div>
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-navy-200 opacity-80">
              NCL / Principal
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant={NCL_BADGE_VARIANT[ncl.result] ?? "neutral"}>
                NCL {ncl.result}
              </Badge>
            </div>
            <div className="mono mt-2 text-sm text-navy-100">
              {data.computation
                ? `₱${formatMoney(data.computation.principal)}`
                : "Not computed"}
            </div>
          </div>
        </div>

        {data.endorseReadiness.missing.length > 0 ||
        data.endorseReadiness.warnings.length > 0 ? (
          <div className="border-t border-navy-800 px-5 py-3">
            <p className="mb-2 text-[10.5px] font-medium uppercase tracking-[0.14em] text-navy-200 opacity-80">
              {data.endorseReadiness.missing.length > 0
                ? "Missing for endorse"
                : "Endorse notes"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {data.endorseReadiness.missing.map((item) => (
                <span
                  key={item}
                  className="rounded-[var(--r-sm)] border border-red-500/40 bg-red-950/50 px-2 py-1 text-[12px] text-red-200"
                >
                  {item}
                </span>
              ))}
              {data.endorseReadiness.warnings.map((item) => (
                <span
                  key={item}
                  className="rounded-[var(--r-sm)] border border-amber-500/40 bg-amber-950/40 px-2 py-1 text-[12px] text-amber-200"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <Card className="mb-6 overflow-x-auto !bg-surface-2/40">
        <h2 className="mb-3 font-display text-lg font-semibold text-navy-900">
          CSA intake progress
        </h2>
        <Stepper steps={workspaceSteps} className="w-full max-w-none" />
      </Card>

      {/* Ordered to match CSA workflow */}
      <div className="space-y-6">
        {data.borrower ? (
          <div className="card profile-card !max-w-none">
            <div className="cover" />
            <div className="pbody">
              <Avatar
                initials={`${data.borrower.firstName.charAt(0)}${data.borrower.lastName.charAt(0)}`}
                size="lg"
              />
              <div className="nm">
                {data.borrower.firstName} {data.borrower.lastName}
              </div>
              <div className="rl">
                {[
                  data.borrower.picWork?.rank,
                  data.borrower.picWork?.vessel,
                  data.borrower.borrowerNo,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>

              {data.borrower.allottee?.name ? (
                <div className="person mt-4 border-t border-line-soft pt-4">
                  <Avatar
                    initials={data.borrower.allottee.name
                      .split(" ")
                      .map((part) => part.charAt(0))
                      .join("")}
                    size="sm"
                    teal
                  />
                  <span>
                    <span className="nm block">
                      {data.borrower.allottee.name}
                    </span>
                    <span className="sub2 block">
                      {data.borrower.allottee.relationship ?? "Allottee"}
                    </span>
                  </span>
                </div>
              ) : null}

              <div className="mt-5 border-t border-line-soft pt-4">
                {editable ? (
                  <form
                    onSubmit={(e) => void handleSaveProfile(e)}
                    className="grid gap-3"
                  >
                    <div>
                      <Label htmlFor="firstName">First name</Label>
                      <Input
                        id="firstName"
                        value={data.borrower.firstName}
                        onChange={(e) =>
                          setData({
                            ...data,
                            borrower: {
                              ...data.borrower!,
                              firstName: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="lastName">Last name</Label>
                      <Input
                        id="lastName"
                        value={data.borrower.lastName}
                        onChange={(e) =>
                          setData({
                            ...data,
                            borrower: {
                              ...data.borrower!,
                              lastName: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="mobilePhone">Mobile</Label>
                      <Input
                        id="mobilePhone"
                        value={data.borrower.mobilePhone ?? ""}
                        onChange={(e) =>
                          setData({
                            ...data,
                            borrower: {
                              ...data.borrower!,
                              mobilePhone: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                    <Button type="submit" loading={saving} size="sm">
                      Save profile
                    </Button>
                  </form>
                ) : (
                  <div className="kv contact-kv">
                    <div className="row">
                      <span className="k">Email</span>
                      <span className="v">{data.borrower.email}</span>
                    </div>
                    <div className="row">
                      <span className="k">Mobile</span>
                      <span className="v mono">
                        {data.borrower.mobilePhone ?? "No mobile on file"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {data.borrower ? (
          <Card className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-navy-900">
                Application Form
              </h2>
              <p className="text-sm text-ink-500">
                Fill this out digitally with the borrower — replaces the
                scanned Credit Application Form. Borrower can also complete
                this themselves from their own portal.
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
        ) : null}

        {data.borrower ? (
          <Modal
            open={showApplicationForm}
            title="Application Form"
            onClose={() => setShowApplicationForm(false)}
            className="!max-w-4xl"
            footer={
              editable ? (
                <Button
                  loading={saving}
                  onClick={() =>
                    void handleSaveProfile().then(() => setShowApplicationForm(false))
                  }
                >
                  Save application form
                </Button>
              ) : null
            }
          >
            <div className="max-h-[65vh] overflow-y-auto pr-1">
              <ApplicantProfileFields
                profile={data.borrower}
                onChange={(borrower) => setData({ ...data, borrower })}
              />
            </div>
          </Modal>
        ) : null}

        <Card>
          <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
            Data Privacy Act orientation
          </h2>
          <p className="mb-4 text-sm text-ink-500">
            CSA must give the Data Privacy Act orientation to the client, then
            confirm here. This is separate from the Data Privacy Consent
            document upload.
          </p>
          {data.application.privacyOrientationAt ? (
            <Alert variant="success">
              Orientation recorded on{" "}
              <span className="mono">
                {new Date(
                  data.application.privacyOrientationAt,
                ).toLocaleString()}
              </span>
              {data.application.privacyOrientationByName
                ? ` · ${data.application.privacyOrientationByName}`
                : ""}
            </Alert>
          ) : editable ? (
            <>
              <Button
                loading={saving}
                onClick={() => setConfirmOrientation(true)}
              >
                Confirm orientation given
              </Button>
              <ConfirmDialog
                open={confirmOrientation}
                title="Confirm Data Privacy Act orientation?"
                message="Confirm that you have given the Data Privacy Act orientation to the client. This is separate from uploading the Data Privacy Consent document."
                confirmLabel="Yes, orientation given"
                loading={saving}
                onCancel={() => setConfirmOrientation(false)}
                onConfirm={() => {
                  void handleConfirmOrientation().then(() =>
                    setConfirmOrientation(false),
                  );
                }}
              />
            </>
          ) : (
            <p className="text-sm text-ink-500">
              Data Privacy Act orientation was not recorded on this file.
            </p>
          )}
        </Card>

        <Card className="!bg-surface-2/30">
          <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
            NCL check
          </h2>
          <p className="mb-4 text-sm text-ink-500">
            Negative credit list screening, recorded before endorsement to CIG.
          </p>

          <div className="mb-4 flex items-start gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-md)]"
              style={NCL_TONE[ncl.result] ?? NCL_TONE.pending}
            >
              <span className="block h-[18px] w-[18px]">
                {NCL_ICON[ncl.result] ?? ClockIcon}
              </span>
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={NCL_BADGE_VARIANT[ncl.result] ?? "neutral"}>
                  {ncl.result}
                </Badge>
                {ncl.checkedAt ? (
                  <span className="text-xs text-ink-400">
                    Checked{" "}
                    <span className="mono">
                      {new Date(ncl.checkedAt).toLocaleString()}
                    </span>
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 text-sm text-ink-700">
                {NCL_COPY[ncl.result] ?? NCL_COPY.pending}
              </p>
            </div>
          </div>

          {editable ? (
            <div className="space-y-3 border-t border-line-soft pt-4">
              <div>
                <Label htmlFor="nclNotes">Remarks</Label>
                <Textarea
                  id="nclNotes"
                  placeholder="Notes for this check (optional)"
                  value={ncl.notes ?? ""}
                  onChange={(e) => setNcl({ ...ncl, notes: e.target.value })}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="accent"
                  loading={saving}
                  onClick={() => void handleRecordNcl("pass")}
                >
                  Record pass
                </Button>
                <Button
                  variant="danger-soft"
                  loading={saving}
                  onClick={() => void handleRecordNcl("fail")}
                >
                  Record fail
                </Button>
              </div>
            </div>
          ) : ncl.notes ? (
            <p className="border-t border-line-soft pt-3 text-sm text-ink-500">
              {ncl.notes}
            </p>
          ) : null}
        </Card>

        <Card>
          <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
            Initial interview
          </h2>
          <p className="mb-4 text-sm text-ink-500">
            Record Clearance interview notes with the client. Required before
            computation and endorse. Clearance Form upload is optional.
          </p>
          {interviewPrereqs.length > 0 ? (
            <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-warning">
              {interviewPrereqs.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          {data.application.initialInterviewAt ? (
            <Alert variant="success" className="mb-3">
              Interview recorded on{" "}
              <span className="mono">
                {new Date(
                  data.application.initialInterviewAt,
                ).toLocaleString()}
              </span>
              {data.application.initialInterviewByName
                ? ` · ${data.application.initialInterviewByName}`
                : ""}
            </Alert>
          ) : null}
          {editable ? (
            <div className="space-y-3">
              <div>
                <Label htmlFor="interviewNotes" required>
                  Interview notes
                </Label>
                <Textarea
                  id="interviewNotes"
                  placeholder="Summary of the initial interview with the client"
                  value={interviewNotes}
                  onChange={(e) => setInterviewNotes(e.target.value)}
                />
              </div>
              <Button
                loading={saving}
                disabled={
                  interviewPrereqs.length > 0 || !interviewNotes.trim()
                }
                onClick={() => setConfirmInterview(true)}
              >
                {data.application.initialInterviewAt
                  ? "Update interview notes"
                  : "Confirm interview recorded"}
              </Button>
              <ConfirmDialog
                open={confirmInterview}
                title="Confirm initial interview?"
                message="Confirm that the initial interview notes are complete. Computation cannot start until this is recorded."
                confirmLabel="Yes, confirm interview"
                loading={saving}
                onCancel={() => setConfirmInterview(false)}
                onConfirm={() => {
                  void handleConfirmInterview().then(() =>
                    setConfirmInterview(false),
                  );
                }}
              />
            </div>
          ) : data.application.initialInterviewNotes ? (
            <p className="whitespace-pre-wrap text-sm text-ink-700">
              {data.application.initialInterviewNotes}
            </p>
          ) : (
            <p className="text-sm text-ink-500">
              Initial interview was not recorded on this file.
            </p>
          )}
        </Card>

        {data.borrower ? (
          <DocumentChecklist
            applicationId={applicationId}
            borrowerId={data.borrower.id}
            stage="intake"
            description="Upload on the borrower's behalf and confirm each file — confirmed documents count toward endorsement. Clearance Form is optional."
            checklistApiPath={`/api/csa/applications/${applicationId}/checklist?stage=intake`}
            uploadApiPath={`/api/csa/applications/${applicationId}/documents`}
            confirmApiPath={(documentId) =>
              `/api/documents/${documentId}/confirm`
            }
            requestRevisionApiPath={(documentId) =>
              `/api/documents/${documentId}/request-revision`
            }
            viewApiPath={(documentId) =>
              `/api/documents/${documentId}/download`
            }
            onUploadComplete={() => void load({ silent: true })}
          />
        ) : null}

        <ComputationPanel
          applicationId={applicationId}
          loanTypeId={data.details?.loanTypeId ?? null}
          editable={editable}
          computation={data.computation}
          onUpdated={() => void load({ silent: true })}
          interviewComplete={Boolean(data.application.initialInterviewAt)}
          interviewBlockReason={
            data.application.initialInterviewAt
              ? null
              : INITIAL_INTERVIEW_COMPUTATION_ERROR
          }
        />

        <Card>
          <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
            Endorse to CIG
          </h2>
          <p className="mb-4 text-sm text-ink-500">
            Everything below must be complete before the file moves to CIG
            verification.
          </p>
          <div className="chk-list !max-w-none mb-4">
            {(() => {
              const thresholdPct = Math.round(
                (data.endorseReadiness.coverageThreshold ?? 0.35) * 100,
              );
              const coverageWarning = data.endorseReadiness.warnings.find((w) =>
                w.includes("Coverage ratio unknown"),
              );
              if (!data.endorseReadiness.coverageOk) {
                const blocker =
                  data.endorseReadiness.missing.find((m) =>
                    m.includes("Monthly amortization exceeds"),
                  ) ?? `Monthly amortization exceeds ${thresholdPct}% of declared income`;
                return (
                  <div className="ci block">
                    <span className="st">·</span>
                    <div>
                      <b>Coverage ratio</b>
                      <span>{blocker}</span>
                    </div>
                  </div>
                );
              }
              if (coverageWarning) {
                return (
                  <div className="ci pend">
                    <span className="st">!</span>
                    <div>
                      <b>Coverage ratio</b>
                      <span>{coverageWarning}</span>
                    </div>
                  </div>
                );
              }
              return (
                <div className="ci ok">
                  <span className="st">{CheckIcon}</span>
                  <div>
                    <b>Coverage ratio</b>
                    <span>
                      Within {thresholdPct}% of declared income
                    </span>
                  </div>
                </div>
              );
            })()}
            {data.endorseReadiness.missing
              .filter((item) => !item.includes("Monthly amortization exceeds"))
              .map((item) => (
                <div key={item} className="ci block">
                  <span className="st">·</span>
                  <div>
                    <b>{item}</b>
                    <span>Not yet complete</span>
                  </div>
                </div>
              ))}
            {data.endorseReadiness.ready ? (
              <div className="ci ok">
                <span className="st">{CheckIcon}</span>
                <div>
                  <b>All requirements met</b>
                  <span>Ready to endorse to CIG</span>
                </div>
              </div>
            ) : null}
          </div>
          {editable ? (
            <div className="space-y-4">
              <Button
                loading={saving}
                disabled={!data.endorseReadiness.ready}
                onClick={() => void handleEndorse()}
              >
                Endorse to CIG
              </Button>
              {data.application.status === "on_hold" ? (
                <div className="space-y-2 border-t border-line-soft pt-4">
                  <p className="text-sm text-ink-600">
                    This file is on hold. Clear the hold after documents and
                    remarks are resolved to resume endorsement.
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    loading={saving}
                    onClick={() => setConfirmClearHold(true)}
                  >
                    Clear hold
                  </Button>
                  <ConfirmDialog
                    open={confirmClearHold}
                    title="Clear hold?"
                    message="Resume intake and clear the hold reason? Documents still needing revision will stay marked until replaced and confirmed."
                    confirmLabel="Yes, clear hold"
                    cancelLabel="Cancel"
                    loading={saving}
                    onConfirm={() => void handleClearHold()}
                    onCancel={() => setConfirmClearHold(false)}
                  />
                </div>
              ) : null}
              <form
                onSubmit={(e) => void handleHold(e)}
                className="space-y-2 border-t border-line-soft pt-4"
              >
                <Label htmlFor="holdReason">Hold reason (if incomplete)</Label>
                <Input
                  id="holdReason"
                  value={holdReason}
                  onChange={(e) => setHoldReason(e.target.value)}
                  placeholder="Reason file cannot be endorsed"
                />
                <Button
                  type="submit"
                  variant="secondary"
                  loading={saving}
                  disabled={!holdReason.trim()}
                >
                  Record hold
                </Button>
              </form>
            </div>
          ) : (
            <p className="text-sm text-ink-500">
              Endorsed — status is{" "}
              {formatStatusLabel(data.application.status)}.
            </p>
          )}
        </Card>

        <NegotiationPanel
          applicationId={applicationId}
          status={data.application.status}
          negotiation={data.negotiation}
          onUpdated={() => void load({ silent: true })}
        />
      </div>
    </div>
  );
}
