"use client";

import { useEffect, useState } from "react";

import { FieldVisitForm } from "@/components/cig/FieldVisitForm";
import { SmeReloanVerificationForm } from "@/components/cig/SmeReloanVerificationForm";
import {
  CiReferencesFormModal,
  ciFormCompletionBadge,
} from "@/components/cig/CiReferencesFormModal";
import { ApplicantProfileFields } from "@/components/borrowers/ApplicantProfileFields";
import { DocumentChecklist } from "@/components/DocumentChecklist";
import { Alert, Badge, Button, Card, Modal, Spinner } from "@/components/ui";
import type { OriginationPacket } from "@/lib/collection/origination-packet";
import {
  assessFieldVisitRequired,
  assessSmeReloanRequired,
  type FieldVisit,
  type SmeReloanVerification,
} from "@/lib/cig/field-visit";
import {
  type PicAddress,
  type PicDemeanorTag,
  type PicPaymentPreference,
  type PicVerification,
  type ReferenceVerification,
  type VerificationChecklist,
} from "@/lib/cig/verification";
import { CSA_ONLY_INTAKE_SLUGS } from "@/lib/documents/csa-only-intake";

export type OriginationPacketDto = OriginationPacket;

type OriginationPacketPanelProps = {
  masterlistId: string;
  caseFileApiBase: string;
  mode: "fetch" | "controlled";
  packet?: OriginationPacketDto | null;
  loading?: boolean;
  error?: string | null;
  className?: string;
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

function asPicVerification(value: unknown): PicVerification | null {
  if (!value || typeof value !== "object") return null;
  return value as PicVerification;
}

function asReferenceVerifications(value: unknown): ReferenceVerification[] | null {
  if (!Array.isArray(value)) return null;
  return value as ReferenceVerification[];
}

function asVerificationChecklist(value: unknown): VerificationChecklist | null {
  if (!value || typeof value !== "object") return null;
  return value as VerificationChecklist;
}

function asFieldVisit(value: unknown): FieldVisit | null {
  if (!value || typeof value !== "object") return null;
  return value as FieldVisit;
}

function asSmeReloanVerification(value: unknown): SmeReloanVerification | null {
  if (!value || typeof value !== "object") return null;
  return value as SmeReloanVerification;
}

function smeUsesReloanForm(verification: OriginationPacket["verification"]): boolean {
  const rel = asSmeReloanVerification(verification?.smeReloanVerification ?? null);
  return rel != null && Object.keys(rel).length > 0;
}

function CsaSummaryCard({ packet }: { packet: OriginationPacketDto }) {
  const { csaSummary, csaScreening, application } = packet;

  return (
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

      {csaSummary.blocker ? (
        <div className="mb-4 rounded-[var(--r-md)] border border-warning/40 bg-warning/10 px-3 py-2.5">
          <p className="text-sm font-medium text-ink-800">
            On hold — {csaSummary.blocker}
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
            Data Privacy Act orientation
          </p>
          {csaSummary.privacyOrientationAt ? (
            <p className="mt-1 text-sm text-ink-700">
              Recorded{" "}
              <span className="mono">
                {new Date(csaSummary.privacyOrientationAt).toLocaleString()}
              </span>
              {csaSummary.privacyOrientationByName
                ? ` · ${csaSummary.privacyOrientationByName}`
                : null}
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink-400">Not recorded.</p>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
            {csaScreening.name ??
              (application.segment === "sme"
                ? "SME duplication check"
                : "NCL check")}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <Badge
              variant={
                csaScreening.result === "pass"
                  ? "success"
                  : csaScreening.result === "fail"
                    ? "danger"
                    : "neutral"
              }
            >
              {csaScreening.result}
            </Badge>
            {csaScreening.checkedAt ? (
              <span className="text-xs text-ink-400">
                {new Date(csaScreening.checkedAt).toLocaleDateString()}
              </span>
            ) : null}
          </div>
          {csaScreening.notes ? (
            <p className="mt-1 text-sm text-ink-700">{csaScreening.notes}</p>
          ) : null}
        </div>

        <div className="sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
            Initial interview
          </p>
          {csaSummary.initialInterviewAt ? (
            <>
              <p className="mt-1 text-sm text-ink-700">
                Recorded{" "}
                <span className="mono">
                  {new Date(csaSummary.initialInterviewAt).toLocaleString()}
                </span>
                {csaSummary.initialInterviewByName
                  ? ` · ${csaSummary.initialInterviewByName}`
                  : null}
              </p>
              {csaSummary.initialInterviewNotes ? (
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink-600">
                  {csaSummary.initialInterviewNotes}
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
            {csaSummary.endorsedAt
              ? new Date(csaSummary.endorsedAt).toLocaleString()
              : "Not yet endorsed"}
            {csaSummary.endorsedByName
              ? ` · ${csaSummary.endorsedByName}`
              : null}
          </p>
        </div>
      </div>

      {csaSummary.timeline.length ? (
        <div className="mt-5 border-t border-line-soft pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
            Status history
          </p>
          <ul className="flex flex-col gap-2">
            {[...csaSummary.timeline]
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
  );
}

function CiReportCard({
  packet,
}: {
  packet: OriginationPacketDto;
}) {
  const [showCiForm, setShowCiForm] = useState(false);
  const verification = packet.verification;
  const segment = packet.application.segment;

  if (!verification) {
    return (
      <Card className="mb-6">
        <h2 className="font-display text-lg font-semibold text-navy-900">
          CI Report
        </h2>
        <p className="mt-2 text-sm text-ink-500">No CIG report on file.</p>
      </Card>
    );
  }

  const picVerification = asPicVerification(verification.picVerification);
  const referenceVerifications = asReferenceVerifications(
    verification.referenceVerifications,
  );
  const verificationChecklist = asVerificationChecklist(
    verification.verificationChecklist,
  );
  const picPaymentPreference =
    verification.picPaymentPreference as PicPaymentPreference | null;
  const picDemeanor = verification.picDemeanor as PicDemeanorTag[] | null;
  const useReloan = segment === "sme" && smeUsesReloanForm(verification);

  const ciBadge =
    segment !== "sme"
      ? ciFormCompletionBadge({
          picVerification,
          referenceVerifications,
          verificationChecklist,
          picRating: verification.picRating,
        })
      : null;

  const smeComplete = useReloan
    ? assessSmeReloanRequired(
        asSmeReloanVerification(verification.smeReloanVerification),
      ).complete
    : assessFieldVisitRequired(asFieldVisit(verification.fieldVisit)).complete;

  return (
    <>
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
            Credit Investigation Group&apos;s verification record — read-only
            evidence from origination.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {segment !== "sme" && ciBadge ? (
            <>
              <Badge variant={ciBadge.variant}>{ciBadge.label}</Badge>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowCiForm(true)}
              >
                View full CI &amp; References Form
              </Button>
            </>
          ) : segment === "sme" ? (
            <Badge variant={smeComplete ? "success" : "warning"}>
              {smeComplete ? "Complete" : "In progress"}
            </Badge>
          ) : null}
        </div>
      </div>

      {verification.finding ? (
        <Badge
          variant={
            verification.finding === "positive" ? "success" : "danger"
          }
        >
          {verification.finding === "positive"
            ? "Positive finding"
            : "Negative finding"}
        </Badge>
      ) : (
        <Badge variant="neutral">Not yet recorded</Badge>
      )}
      {verification.findingNotes ? (
        <p className="mt-3 text-sm text-ink-700">{verification.findingNotes}</p>
      ) : null}
      {verification.forwardedAt ? (
        <p className="mt-2 text-xs text-ink-400">
          Forwarded by CIG{" "}
          <span className="mono">
            {new Date(verification.forwardedAt).toLocaleString()}
          </span>
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 border-t border-line-soft pt-4 sm:grid-cols-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            Field completeness
          </div>
          <p className="mt-1 text-sm text-ink-700">
            {displayBool(verification.fieldCompletenessOk)}
          </p>
          {verification.fieldCompletenessNotes ? (
            <p className="mt-1 text-xs text-ink-400">
              {verification.fieldCompletenessNotes}
            </p>
          ) : null}
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            Borrower interview
          </div>
          <p className="mt-1 text-sm text-ink-700">
            {verification.biNotes || "No notes recorded."}
          </p>
          <p className="mt-1 text-xs text-ink-400">
            Identity{" "}
            {verification.biIdentityConfirmed ? "confirmed" : "not confirmed"}
            {" · "}Purpose{" "}
            {verification.biPurposeConfirmed ? "confirmed" : "not confirmed"}
            {" · "}Details{" "}
            {verification.biDetailsConfirmed ? "confirmed" : "not confirmed"}
          </p>
        </div>
      </div>

      {segment !== "sme" ? (
        <>
          <div className="mt-4 border-t border-line-soft pt-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Crewing manager
            </div>
            <div className="mt-2 grid gap-x-4 gap-y-1 text-sm text-ink-700 sm:grid-cols-2">
              <p>
                <span className="text-ink-400">Position:</span>{" "}
                {displayText(verification.cmPosition)}
              </p>
              <p>
                <span className="text-ink-400">Contract status:</span>{" "}
                {displayText(verification.cmContractStatus)}
              </p>
              <p>
                <span className="text-ink-400">Departure:</span>{" "}
                {verification.cmDepartureDate
                  ? new Date(verification.cmDepartureDate).toLocaleDateString()
                  : "—"}
              </p>
              <p>
                <span className="text-ink-400">Salary:</span>{" "}
                {verification.cmSalary != null
                  ? `₱${formatMoney(verification.cmSalary)}`
                  : "—"}
              </p>
              <p>
                <span className="text-ink-400">Fit to work:</span>{" "}
                {displayBool(verification.cmFitToWork)}
              </p>
              <p>
                <span className="text-ink-400">Crewing manager:</span>{" "}
                {displayText(verification.cmManagerName)}
                {verification.cmManagerPosition
                  ? ` (${verification.cmManagerPosition})`
                  : ""}
              </p>
              <p>
                <span className="text-ink-400">CM contact:</span>{" "}
                {displayText(verification.cmManagerContact)}
              </p>
              <p>
                <span className="text-ink-400">Manning agency:</span>{" "}
                {displayText(verification.cmManningAgencyName)}
              </p>
              <p>
                <span className="text-ink-400">Joining port:</span>{" "}
                {displayText(verification.cmJoiningPort)}
              </p>
            </div>
            {verification.cmNotes ? (
              <p className="mt-2 text-sm text-ink-700">{verification.cmNotes}</p>
            ) : null}
          </div>

          <div className="mt-4 border-t border-line-soft pt-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
              CI &amp; References Form 1 — PIC verification
            </div>
            {picVerification ? (
              <div className="mt-2 grid gap-x-4 gap-y-1 text-sm text-ink-700 sm:grid-cols-2">
                <p>
                  <span className="text-ink-400">Name:</span>{" "}
                  {displayText(picVerification.name)}
                </p>
                <p>
                  <span className="text-ink-400">Birthday:</span>{" "}
                  {displayText(picVerification.birthday)}
                </p>
                <p>
                  <span className="text-ink-400">Relation to client:</span>{" "}
                  {displayText(picVerification.relationToClient)}
                </p>
                <p>
                  <span className="text-ink-400">Contact number:</span>{" "}
                  {displayText(picVerification.contactNumber)}
                </p>
                <p className="sm:col-span-2">
                  <span className="text-ink-400">Present address:</span>{" "}
                  {formatAddress(picVerification.presentAddress)}
                </p>
                <p className="sm:col-span-2">
                  <span className="text-ink-400">Provincial address:</span>{" "}
                  {formatAddress(picVerification.provincialAddress)}
                </p>
              </div>
            ) : (
              <p className="mt-1 text-sm text-ink-400">Not recorded.</p>
            )}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {(referenceVerifications?.length
                ? referenceVerifications
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
                {verificationChecklist ? (
                  <ul className="mt-1 space-y-1 text-sm text-ink-700">
                    {CHECKLIST_LABELS.map(({ key, label }) => (
                      <li key={key}>
                        {verificationChecklist[key] ? "✓" : "○"} {label}
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
                  {picPaymentPreference?.method || "—"}
                  {picPaymentPreference?.bankSpecify
                    ? ` · ${picPaymentPreference.bankSpecify}`
                    : ""}
                </p>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  PIC rating
                </div>
                <p className="mt-1 text-sm text-ink-700">
                  {verification.picRating != null
                    ? `${verification.picRating} / 5`
                    : "—"}
                  {picDemeanor?.length ? ` · ${picDemeanor.join(", ")}` : ""}
                </p>
                {verification.picRatingReason ? (
                  <p className="mt-1 text-xs text-ink-400">
                    {verification.picRatingReason}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-ink-400">
                  Verified by {displayText(verification.cifVerifiedBy)}
                  {verification.cifVerifiedDate
                    ? ` · ${verification.cifVerifiedDate}`
                    : ""}
                </p>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-4 border-t border-line-soft pt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
            {useReloan ? "SME re-loan verification" : "SME Field Visit"}
          </div>
          {useReloan ? (
            <SmeReloanVerificationForm
              value={asSmeReloanVerification(verification.smeReloanVerification)}
              onChange={() => undefined}
              onSave={() => undefined}
              verifierName=""
              readOnly
            />
          ) : (
            <FieldVisitForm
              value={asFieldVisit(verification.fieldVisit)}
              onChange={() => undefined}
              onSave={() => undefined}
              verifierName=""
              readOnly
            />
          )}
        </div>
      )}
      </Card>
      {showCiForm && segment !== "sme" ? (
        <CiReferencesFormModal
          open={showCiForm}
          onClose={() => setShowCiForm(false)}
          borrower={packet.borrower.profile}
          saved={{
            picVerification,
            referenceVerifications,
            verificationChecklist,
            picPaymentPreference,
            picDemeanor,
            picRating: verification.picRating,
            picRatingReason: verification.picRatingReason,
            cifVerifiedBy: verification.cifVerifiedBy,
            cifVerifiedDate: verification.cifVerifiedDate,
          }}
          onSave={async () => undefined}
          saving={false}
          readOnly
          verifierName=""
        />
      ) : null}
    </>
  );
}

function ApplicationFormCard({ packet }: { packet: OriginationPacketDto }) {
  const [showApplicationForm, setShowApplicationForm] = useState(false);
  const profile = packet.borrower.profile;

  if (!profile) return null;

  return (
    <>
      <Card className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-navy-900">
            Application form
          </h2>
          <p className="text-sm text-ink-500">
            Read-only copy of the credit application filled by the borrower or
            CSA.
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

      <Modal
        open={showApplicationForm}
        title="Application Form"
        onClose={() => setShowApplicationForm(false)}
        className="!max-w-4xl"
      >
        <div className="max-h-[65vh] overflow-y-auto pr-1">
          <ApplicantProfileFields
            profile={profile}
            segment={packet.application.segment}
            entityType={packet.application.entityType}
            readOnly
          />
        </div>
      </Modal>
    </>
  );
}

function PacketBody({
  packet,
  caseFileApiBase,
}: {
  packet: OriginationPacketDto;
  caseFileApiBase: string;
}) {
  const borrowerId = packet.borrower.id;
  const applicationId = packet.application.id;

  if (!borrowerId) {
    return (
      <Alert variant="warning">
        Origination packet unavailable for this account.
      </Alert>
    );
  }

  return (
    <>
      <CsaSummaryCard packet={packet} />
      <ApplicationFormCard packet={packet} />
      <CiReportCard packet={packet} />
      <DocumentChecklist
        applicationId={applicationId}
        borrowerId={borrowerId}
        stage="intake"
        readOnly
        checklistApiPath={`${caseFileApiBase}/checklist`}
        viewApiPath={(documentId) =>
          `${caseFileApiBase}/documents/${documentId}/download`
        }
        title="Borrower attachments"
        description={
          packet.application.segment === "sme"
            ? "Read-only — business registration, permits, financial statements, and other intake files uploaded by the borrower."
            : "Read-only — Passport, Seaman's Book, Contract, IDs, and House Sketch uploaded by the borrower."
        }
        excludeSlugs={CSA_ONLY_INTAKE_SLUGS}
      />
      <DocumentChecklist
        applicationId={applicationId}
        borrowerId={borrowerId}
        stage="intake"
        readOnly
        checklistApiPath={`${caseFileApiBase}/checklist`}
        viewApiPath={(documentId) =>
          `${caseFileApiBase}/documents/${documentId}/download`
        }
        title="CSA attachments"
        description="Read-only — signed in person at the branch and uploaded by CSA on the borrower's behalf."
        includeSlugs={CSA_ONLY_INTAKE_SLUGS}
      />
    </>
  );
}

export function OriginationPacketPanel({
  masterlistId: _masterlistId,
  caseFileApiBase,
  mode,
  packet: controlledPacket,
  loading: controlledLoading,
  error: controlledError,
  className = "",
}: OriginationPacketPanelProps) {
  void _masterlistId;
  const [fetchedPacket, setFetchedPacket] = useState<OriginationPacketDto | null>(
    null,
  );
  const [fetchLoading, setFetchLoading] = useState(mode === "fetch");
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "fetch") return;
    let cancelled = false;

    async function fetchPacket() {
      try {
        const res = await fetch(caseFileApiBase);
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? "Failed to load origination packet");
        }
        const body = (await res.json()) as OriginationPacketDto;
        if (!cancelled) setFetchedPacket(body);
      } catch (err) {
        if (cancelled) return;
        setFetchedPacket(null);
        setFetchError(
          err instanceof Error
            ? err.message
            : "Failed to load origination packet",
        );
      } finally {
        if (!cancelled) setFetchLoading(false);
      }
    }

    void fetchPacket();
    return () => {
      cancelled = true;
    };
  }, [caseFileApiBase, mode]);

  const loading =
    mode === "fetch" ? fetchLoading : (controlledLoading ?? false);
  const error = mode === "fetch" ? fetchError : (controlledError ?? null);
  const packet = mode === "fetch" ? fetchedPacket : (controlledPacket ?? null);

  if (loading) {
    return (
      <div className={`flex justify-center py-10 ${className}`}>
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="danger" className={className}>
        {error}
      </Alert>
    );
  }

  if (!packet) {
    return (
      <Alert variant="warning" className={className}>
        Origination packet unavailable for this account.
      </Alert>
    );
  }

  return (
    <div className={className}>
      <PacketBody packet={packet} caseFileApiBase={caseFileApiBase} />
    </div>
  );
}
